/**
 * Cloudflare Workers - WorkLearn API Proxy
 * Routes API requests to external backend
 */

const API_BACKEND = "https://api.worklearn.io"; // Change to your backend URL
const ALLOWED_ORIGINS = [
  "https://career.jockerow.com",
  "https://www.career.jockerow.com",
];

export default {
  async fetch(request, env) {
    const { pathname, search } = new URL(request.url);

    // CORS handling
    if (request.method === "OPTIONS") {
      return handleCORS(request);
    }

    // API routes
    if (pathname.startsWith("/api/")) {
      return handleAPI(request, pathname, search, env);
    }

    // Webhooks
    if (pathname.startsWith("/webhooks/")) {
      return handleWebhook(request, pathname, search, env);
    }

    // Health check
    if (pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleAPI(request, pathname, search, env) {
  const url = `${API_BACKEND}${pathname}${search}`;

  const response = await fetch(url, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers),
      "X-Forwarded-For": request.headers.get("cf-connecting-ip"),
      "X-Forwarded-Proto": "https",
    },
    body: request.body,
  }).catch(() => {
    return new Response(
      JSON.stringify({
        error: "Backend service unavailable",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  // Add CORS headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set(
    "Access-Control-Allow-Origin",
    request.headers.get("origin") || "https://career.jockerow.com"
  );
  newResponse.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  newResponse.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );
  newResponse.headers.set("Access-Control-Allow-Credentials", "true");

  return newResponse;
}

async function handleWebhook(request, pathname, search, env) {
  // Validate webhook signature if needed
  const url = `${API_BACKEND}${pathname}${search}`;

  return fetch(url, {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body: request.body,
  }).catch(() => {
    return new Response(JSON.stringify({ error: "Webhook failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function handleCORS(request) {
  if (
    request.method === "OPTIONS" &&
    ALLOWED_ORIGINS.includes(request.headers.get("origin"))
  ) {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": request.headers.get("origin"),
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  return new Response("Forbidden", { status: 403 });
}
