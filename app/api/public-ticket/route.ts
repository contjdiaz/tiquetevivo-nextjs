/**
 * GET /api/public-ticket?slug=<slug>&number=<order_number>
 * Public, unauthenticated endpoint that returns a SINGLE order plus the
 * business public config, for the customer-facing ticket page.
 *
 * The fetch + field whitelist live in lib/api/public-ticket-data.ts so this
 * route and the /tiquete Server Component always return the same sanitized
 * shape. This route adds rate limiting on top of the shared data source.
 */
import { getClientIp, json } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { getPublicTicket } from "@/lib/api/public-ticket-data";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const slug = event.queryStringParameters?.slug;
  const number = event.queryStringParameters?.number;

  if (!slug || !number) {
    return json(400, { error: "Missing required parameters: slug, number" });
  }

  const clientIp = getClientIp(event);
  const rate = checkRateLimit(`${clientIp}:public-ticket`, 60, 60000);
  if (!rate.allowed) {
    return {
      statusCode: 429,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfter)
      },
      body: JSON.stringify({ error: "Too many requests" })
    };
  }

  const result = await getPublicTicket(slug, number);
  if (result.ok) {
    return json(200, result.data);
  }
  const failure = result as { status: number; error: string };
  return json(failure.status, { error: failure.error });
}

export const GET = netlifyHandler(handler);
