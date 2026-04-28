/**
 * Cloudflare Workers - WorkLearn AI API Proxy & Router
 * Routes:
 * - / → Frontend (Cloudflare Pages)
 * - /api/* → API Proxy to backend
 * - /health → Health check
 */

const FRONTEND_URL = "https://worklearn-career.modemo-future.pages.dev";
const API_BACKEND = "https://api.example.com"; // Change to your backend URL

const ALLOWED_ORIGINS = [
  "https://career.jokerow.com",
  "https://www.career.jokerow.com",
  "http://localhost:3000",
];

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // Health check endpoint
      if (pathname === "/health") {
        return new Response(
          JSON.stringify({
            status: "ok",
            timestamp: new Date().toISOString(),
            service: "WorkLearn AI API Proxy",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // API routes
      if (pathname.startsWith("/api/")) {
        return handleAPI(request, pathname, url, env);
      }

      // Webhooks
      if (pathname.startsWith("/webhooks/")) {
        return handleWebhook(request, pathname, url);
      }

      // Default: Proxy to frontend
      return handleFrontend(request, url);
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};

async function handleAPI(request, pathname, url, env) {
  const apiUrl = `${API_BACKEND}${pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-For", request.headers.get("cf-connecting-ip") || "");
  headers.set("X-Forwarded-Proto", "https");

  try {
    const response = await fetch(apiUrl, {
      method: request.method,
      headers,
      body: request.body,
      cf: { cacheEverything: false },
    }).catch(() => {
      throw new Error("Backend service unavailable");
    });

    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

    // Add CORS headers
    const origin = request.headers.get("origin") || "https://career.jokerow.com";
    newResponse.headers.set(
      "Access-Control-Allow-Origin",
      ALLOWED_ORIGINS.includes(origin) ? origin : "https://career.jokerow.com"
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
    newResponse.headers.set("Access-Control-Max-Age", "86400");

    return newResponse;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "API Error",
        message: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://career.jokerow.com",
        },
      }
    );
  }
}

async function handleWebhook(request, pathname, url) {
  const apiUrl = `${API_BACKEND}${pathname}${url.search}`;

  try {
    const response = await fetch(apiUrl, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body: request.body,
    });

    return new Response(response.body, {
      status: response.status,
      headers: new Headers(response.headers),
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Webhook failed",
        message: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function handleFrontend(request, url) {
  // Proxy all other requests to frontend
  const frontendUrl = new URL(request.url);
  frontendUrl.host = new URL(FRONTEND_URL).host;

  return fetch(new Request(frontendUrl, { method: request.method }));
}
