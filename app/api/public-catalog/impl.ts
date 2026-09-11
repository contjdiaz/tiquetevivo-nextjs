/**
 * Public catalog endpoint (R5, R10, R11) for every catalog vertical.
 *
 * GET /api/public-catalog?slug={business-slug}
 *
 * Returns the public catalog of a business registered in the vertical engine:
 *   - product verticals (fruver): only `active` products;
 *   - service verticals (lavanderia): only `active` entries of
 *     `services_config`;
 * plus only currently-vigent promotions, all projected through the whitelist
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
import {
  buildAdvertisingBlocks,
} from "@/lib/fruver/advertising";
import {
  CATALOG_VERTICALS,
  getVerticalDefinition,
} from "@/lib/vertical/definitions";
import {
  SERVICE_UNITS,
  type PublicService,
  type Service,
  type ServiceUnit,
} from "@/lib/lavanderia/types";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60000;

/** Validates/coerces a service unit, falling back to `flat_rate`. */
function coerceServiceUnit(unit: unknown): ServiceUnit {
  return SERVICE_UNITS.includes(unit as ServiceUnit)
    ? (unit as ServiceUnit)
    : "flat_rate";
}

/** Projects an active `services_config` entry onto its public whitelist shape. */
function toPublicService(service: Service, index: number): PublicService {
  // Services in `services_config` carry no id; use the stable position-based id
  // so quotes can reference the exact service they were priced against.
  const id = `svc-${index}`;
  return {
    id,
    name: service.name || "Servicio",
    description:
      typeof service.description === "string" ? service.description : null,
    unit: coerceServiceUnit(service.unit),
    price:
      typeof service.default_price === "number" && Number.isFinite(service.default_price)
        ? service.default_price
        : 0,
    duration:
      typeof service.duration === "number" && Number.isFinite(service.duration)
        ? service.duration
        : null,
  };
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {

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

    // Resolve the vertical slug via vertical_id and verify it is registered.
    let verticalSlug: string | null = null;
    if (business.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("slug")
        .eq("id", business.vertical_id)
        .single();
      verticalSlug = vertical?.slug ?? null;
    }
    if (!verticalSlug || !CATALOG_VERTICALS.includes(verticalSlug)) {
      return json(404, { error: true, message: "Business not found" });
    }
    const definition = getVerticalDefinition(verticalSlug);
    const catalogKind = definition?.catalogKind ?? "products";

    // --- Vigent promotions only (R4.1, R4.3, R4.5) ---
    const { data: promotions, error: promotionsError } = await supabase
      .from("promotions")
      .select("*")
      .eq("business_id", business.id)
      .eq("active", true);
    if (promotionsError) throw promotionsError;

    const now = new Date();

    let products: any[] | null = null;
    let services: PublicService[] | null = null;

    if (catalogKind === "products") {
      // --- Active products only (R5.1, R2.7, R11.3) ---
      const { data: productRows, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("business_id", business.id)
        .eq("active", true)
        .order("name", { ascending: true });
      if (productsError) throw productsError;
      products = productRows || [];
    } else {
      // --- Active services from `services_config` (lavanderia) ---
      const rawVigent = Array.isArray(business.services_config)
        ? business.services_config.filter(
            (service: Service) => service.active !== false
          )
        : [];
      services = rawVigent.map(toPublicService);
    }

    // Compose the full advertising blocks from sanitized data (R4). The
    // catalog page renders only non-empty blocks (R4.7).
    const advertising = buildAdvertisingBlocks({
      vertical_slug: verticalSlug,
      catalogKind,
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
      ...(catalogKind === "products"
        ? { products: toPublicProducts(products || []) }
        : { services }),
      promotions: toPublicPromotions(getActivePromotions(promotions || [], now)),
      advertising
    });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}