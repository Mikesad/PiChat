const fallbackApiUrl = "http://127.0.0.1:3001/api";

function apiBaseUrl() {
  return (process.env.API_URL ?? fallbackApiUrl).replace(/\/+$/, "");
}

function errorResponse(status: number, message: string) {
  return Response.json(
    {
      code: status === 502 ? "internal_error" : "invalid_request",
      message,
      details: null,
    },
    { status },
  );
}

export async function proxyToApi(request: Request, path: string): Promise<Response> {
  const search = new URL(request.url).search;
  const url = `${apiBaseUrl()}/${path.replace(/^\/+/, "")}${search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");
  const accept = request.headers.get("accept");
  const range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");

  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (cookie) {
    headers.set("cookie", cookie);
  }
  if (accept) {
    headers.set("accept", accept);
  }
  if (range) {
    headers.set("range", range);
  }
  if (ifRange) {
    headers.set("if-range", ifRange);
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return errorResponse(502, "API 服务暂时不可用，请确认后端已启动。");
  }

  const responseHeaders = new Headers();
  const responseContentType = upstream.headers.get("content-type");
  if (responseContentType) {
    responseHeaders.set("content-type", responseContentType);
  }
  for (const name of [
    "accept-ranges",
    "content-disposition",
    "content-length",
    "content-range",
    "x-content-type-options",
  ]) {
    const value = upstream.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }
  if (responseContentType?.includes("text/event-stream")) {
    responseHeaders.set("cache-control", "no-cache, no-transform");
    responseHeaders.set("connection", "keep-alive");
    responseHeaders.set("x-accel-buffering", "no");
  } else {
    responseHeaders.set("cache-control", "no-store");
  }

  const setCookies = upstream.headers.getSetCookie();
  if (setCookies.length > 0) {
    for (const value of setCookies) {
      responseHeaders.append("set-cookie", value);
    }
  } else {
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) {
      responseHeaders.append("set-cookie", setCookie);
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
