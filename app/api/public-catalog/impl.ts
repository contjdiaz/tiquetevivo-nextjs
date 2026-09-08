/**
 * Public catalog endpoint (R5, R10, R11) for the "fruver" vertical.
 *
 * GET /api/public-catalog?slug={business-slug}
 *
 * Returns the public catalog of a fruver business: only `active` products and
 * only currently-vigent promotions, projected through the whitelist
 * sanitizers so no tenant/internal fields ever reach the browser (R5.6,
 * R10.3). The endpoint is rate-limited per client IP (R10.1, R10.2) and
 * rejects invalid input before touching the database (R10.4).
 */

import {
  json,
  supabaseAdmin,
  getClientIp,
  slugify
} from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { getActivePromotions } from "@/lib/fruver/promotions";
import { toPublicProducts, toPublicPromotions } from "@/lib/fruver/sanitize";
import { buildAdvertisingBlocks } from "@/lib/fruver/advertising";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60000;

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    // --- Input validation before any DB access (R10.4) ---
    const rawSlug =
      (event.queryStringParameters && event.queryStringParameters.slug) || "";
    const slug = slugify(rawSlug);
    if (!slug) {
      return json(400, { error: true, message: "slug is required" });
    }

    // --- Rate limiting per client IP (R10.1, R10.2) ---
    const ip = getClientIp(event);
    const rl = checkRateLimit(`${ip}:public-catalog`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.allowed) {
      return json(429, {
        error: true,
        message: "Too many requests",
        retryAfter: rl.retryAfter
      });
    }

    const supabase = supabaseAdmin();

    // --- Resolve business and verify vertical (R5.1) ---
    // Query directly (instead of getBusinessBySlug) so a genuine DB/auth error
    // surfaces as 500, while a missing row surfaces as 404. This keeps the
    // "not found" path from masking connection problems.
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (businessError) {
      return json(500, { error: true, message: `DB error: ${businessError.message}` });
    }
    if (!business) {
      return json(404, { error: true, message: "Business not found" });
    }

    // Resolve the vertical slug via vertical_id and verify it is "fruver".
    let verticalSlug: string | null = null;
    if (business.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("slug")
        .eq("id", business.vertical_id)
        .single();
      verticalSlug = vertical?.slug ?? null;
    }
    if (verticalSlug !== "fruver") {
      return json(404, { error: true, message: "Business not found" });
    }

    // --- Active products only (R5.1, R2.7, R11.3) ---
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name", { ascending: true });
    if (productsError) throw productsError;

    // --- Vigent promotions only (R4.1, R4.3, R4.5) ---
    const { data: promotions, error: promotionsError } = await supabase
      .from("promotions")
      .select("*")
      .eq("business_id", business.id)
      .eq("active", true);
    if (promotionsError) throw promotionsError;

    const now = new Date();
    const vigent = getActivePromotions(promotions || [], now);

    // Compose the full advertising blocks (banners, season, combos, social
    // invite, discount code) from sanitized data (R4). The catalog page
    // renders only non-empty blocks (R4.7). Note: the season section needs the
    // full product set, so we pass `products` (already active-only here).
    const advertising = buildAdvertisingBlocks({
      vertical_slug: "fruver",
      products: products || [],
      promotions: promotions || [],
      promotionsConfig: business.promotions_config || null,
      now
    });

    // --- Whitelist projection (R5.6, R10.3) ---
    return json(200, {
      business: {
        slug: business.slug,
        name: business.name,
        color: business.color ?? null,
        logo_url: business.logo_url ?? null
      },
      products: toPublicProducts(products || []),
      promotions: toPublicPromotions(vigent),
      advertising
    });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
