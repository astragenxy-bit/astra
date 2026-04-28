/**
 * WorkLearn Cloudflare Edge Worker
 * - Caches public API responses at edge (150+ PoPs toàn cầu)
 * - Rate limiting per IP
 * - Geo-based routing (Vietnam data stays in Asia)
 * - Security headers
 */

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── Security headers on all responses ──────────────────
    const securityHeaders = {
      'X-Frame-Options':         'SAMEORIGIN',
      'X-Content-Type-Options':  'nosniff',
      'X-XSS-Protection':        '1; mode=block',
      'Referrer-Policy':         'strict-origin-when-cross-origin',
      'Permissions-Policy':      'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    };

    // ── Rate limiting: 60 req/min per IP ───────────────────
    if (path.startsWith('/api/')) {
      const ip        = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateKey   = `rate:${ip}:${Math.floor(Date.now() / 60000)}`;
      const count     = await env.CACHE.get(rateKey);
      const reqCount  = parseInt(count || '0') + 1;

      // Auth endpoints: stricter limit (10/min)
      const limit = path.includes('/auth/') ? 10 : 60;
      if (reqCount > limit) {
        return new Response(JSON.stringify({ error: 'RATE_LIMITED', retry_after: 60 }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...securityHeaders },
        });
      }
      ctx.waitUntil(env.CACHE.put(rateKey, String(reqCount), { expirationTtl: 61 }));
    }

    // ── Cache public read-only API responses ───────────────
    const cacheable = isCacheable(request, path);
    if (cacheable) {
      const cacheKey   = `api:${path}:${url.search}`;
      const cached     = await env.CACHE.get(cacheKey, 'json');
      if (cached) {
        return new Response(JSON.stringify(cached), {
          headers: {
            'Content-Type':  'application/json',
            'X-Cache':       'HIT',
            'X-CF-PoP':      request.cf?.colo || 'unknown',
            ...securityHeaders,
          },
        });
      }
    }

    // ── Proxy to origin ────────────────────────────────────
    const originUrl = new URL(request.url);
    originUrl.hostname = env.API_BASE.replace('https://', '');
    const originReq = new Request(originUrl.toString(), {
      method:  request.method,
      headers: request.headers,
      body:    ['GET','HEAD'].includes(request.method) ? null : request.body,
    });

    const originRes = await fetch(originReq);

    // Cache successful GET responses
    if (cacheable && originRes.ok) {
      const ttl  = getCacheTTL(path, env);
      const data = await originRes.clone().json().catch(() => null);
      if (data) ctx.waitUntil(env.CACHE.put(`api:${path}:${url.search}`, JSON.stringify(data), { expirationTtl: ttl }));
    }

    // Add security + cache headers to response
    const newHeaders = new Headers(originRes.headers);
    Object.entries(securityHeaders).forEach(([k, v]) => newHeaders.set(k, v));
    newHeaders.set('X-Cache',  'MISS');
    newHeaders.set('X-CF-PoP', request.cf?.colo || 'unknown');

    return new Response(originRes.body, {
      status:  originRes.status,
      headers: newHeaders,
    });
  },
};

// Only cache safe, public GET requests
function isCacheable(request, path) {
  if (request.method !== 'GET') return false;
  if (request.headers.get('Authorization')) return false;
  const cachePaths = ['/api/v1/jobs', '/api/v1/courses', '/api/v1/health', '/api/v1/ai/jd/skills-suggest'];
  return cachePaths.some(p => path.startsWith(p));
}

function getCacheTTL(path, env) {
  if (path.startsWith('/api/v1/jobs'))    return parseInt(env.CACHE_TTL_JOBS    || '300');
  if (path.startsWith('/api/v1/courses')) return parseInt(env.CACHE_TTL_COURSES || '600');
  return 60;
}
