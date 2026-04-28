/**
 * Cloudflare Workers - WorkLearn AI Router
 * Routes frontend to Pages, API to backend
 */

const PAGES_URL = "https://worklearn-career.modemo-future.pages.dev";
const API_BACKEND = "https://api.example.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Health check
      if (pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // API routes
      if (pathname.startsWith("/api/")) {
        return handleAPI(request, pathname, url);
      }

      // Webhooks
      if (pathname.startsWith("/webhooks/")) {
        return handleWebhook(request, pathname, url);
      }

      // Everything else → Frontend
      return fetch(new Request(PAGES_URL + pathname + url.search, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      }));
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  },
};

async function handleAPI(request, pathname, url) {
  const apiUrl = `${API_BACKEND}${pathname}${url.search}`;

  try {
    const response = await fetch(apiUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "https://career.jokerow.com");
    newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return newResponse;
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleWebhook(request, pathname, url) {
  return fetch(`${API_BACKEND}${pathname}${url.search}`, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}
