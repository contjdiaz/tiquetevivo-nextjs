import { getClientIp, json, slugify, supabaseAdmin } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

/**
 * GET /api/check-slug?slug=<slug>
 * Responds { available: boolean }.
 * Validates the slug with slugify, queries the businesses table by slug,
 * and applies a per-IP rate limit to avoid slug enumeration.
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    // Rate limit per IP to prevent enumeration of existing slugs.
    const clientIp = getClientIp(event);
    const rateLimitKey = `${clientIp}:check-slug`;
    const rateResult = checkRateLimit(rateLimitKey, 30, 60000);

    if (!rateResult.allowed) {
      return {
        statusCode: 429,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Content-Type": "application/json",
          "Retry-After": String(rateResult.retryAfter)
        },
        body: JSON.stringify({ error: "Too many requests" })
      };
    }

    const rawSlug = event.queryStringParameters?.slug;
    const slug = slugify(rawSlug);

    // An empty or invalid slug is never available.
    if (!slug) {
      return json(400, { available: false, error: "Invalid slug" });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;

    return json(200, { available: !data });
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}
