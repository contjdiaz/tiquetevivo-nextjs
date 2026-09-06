import { NextRequest } from "next/server";

/**
 * Netlify-style event shape kept so the ported function bodies
 * remain faithful to the original TiqueteVivo codebase.
 */
export type NetlifyEvent = {
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | string[] | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  path?: string;
};

export type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export function json(statusCode: number, body: unknown): NetlifyResponse {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

export async function fromNextRequest(req: NextRequest): Promise<NetlifyEvent> {
  const text = await req.text();
  const headers: Record<string, string | string[] | undefined> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const queryStringParameters: Record<string, string | undefined> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    queryStringParameters[key] = value;
  });

  return {
    httpMethod: req.method,
    body: text || null,
    headers,
    queryStringParameters,
    path: req.nextUrl.pathname
  };
}

export function toNextResponse(res: NetlifyResponse): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers || {})) {
    headers.set(key, value);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(res.body || null, { status: res.statusCode, headers });
}

/** Wraps a Netlify-style handler so it can be exported as a Next.js route handler. */
export function netlifyHandler(
  handler: (event: NetlifyEvent) => Promise<NetlifyResponse> | NetlifyResponse
) {
  return async (req: NextRequest): Promise<Response> => {
    const event = await fromNextRequest(req);
    const res = await handler(event);
    return toNextResponse(res);
  };
}