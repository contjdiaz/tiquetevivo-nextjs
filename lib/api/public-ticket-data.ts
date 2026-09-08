/**
 * Server-side data source for the public customer ticket.
 *
 * Runs with the service-role Supabase client, so it MUST return only
 * public-safe data. It is shared by:
 *   - the public HTTP route  (app/api/public-ticket/route.ts)
 *   - the Server Component   (app/tiquete/page.tsx)
 *
 * Centralizing the fetch + field whitelist here guarantees both surfaces
 * expose exactly the same sanitized shape and can never drift apart.
 */
import { getBusinessBySlug, supabaseAdmin } from "./_utils";
import { getLoyaltySummary } from "./_loyalty";
import { getSignedPhotoUrl } from "./_photo-storage";
import { buildAdvertisingBlocks, type AdvertisingBlocks } from "@/lib/fruver/advertising";

/**
 * Fields that must never reach the browser on the public ticket.
 * customer_name is intentionally kept: it is the customer's own ticket.
 */
const SENSITIVE_ORDER_FIELDS = [
  "customer_phone",
  "internal_notes",
  "notes",
  "intake_confirmed_ip",
  "delivery_confirmed_ip",
  "customer_id"
] as const;

function stripSensitiveOrderFields(order: any) {
  if (!order || typeof order !== "object") return order;
  const safe: Record<string, any> = { ...order };
  for (const field of SENSITIVE_ORDER_FIELDS) delete safe[field];
  return safe;
}

async function signPhotos(supabase: any, order: any) {
  if (order.intake_photo_url) {
    try {
      order.intake_photo_url = await getSignedPhotoUrl(supabase, order.intake_photo_url);
    } catch (err: any) {
      console.error("[public-ticket-data] intake photo sign failed:", err.message);
    }
  }
  if (order.delivery_photo_url) {
    try {
      order.delivery_photo_url = await getSignedPhotoUrl(supabase, order.delivery_photo_url);
    } catch (err: any) {
      console.error("[public-ticket-data] delivery photo sign failed:", err.message);
    }
  }
}

export interface PublicTicketSuccess {
  ok: true;
  status: 200;
  data: PublicTicketData;
}

export interface PublicTicketFailure {
  ok: false;
  status: 400 | 404 | 500;
  error: string;
}

export type PublicTicketResult = PublicTicketSuccess | PublicTicketFailure;

export interface PublicTicketData {
  orders: any[];
  approval: any | null;
  business: {
    name: string;
    phone: string | null;
    slug: string;
    color: string | null;
    logo_url: string | null;
    plan: string;
    status_flow_config: any[];
    custom_fields_config: any[];
    loyalty_config: any;
    vertical_emoji: string | null;
    vertical_slug: string | null;
    payment_config: any;
  };
  loyalty: any | null;
  /** Fruver advertising blocks; present only for the fruver vertical (R4). */
  advertising?: AdvertisingBlocks;
}

/**
 * Fetches and sanitizes a single public ticket by business slug + order number.
 * Returns a discriminated result so callers can map to HTTP status or render state.
 */
export async function getPublicTicket(
  slug: string | undefined,
  number: string | undefined
): Promise<PublicTicketResult> {
  if (!slug || !number) {
    return { ok: false, status: 400, error: "Missing required parameters: slug, number" };
  }

  try {
    const supabase = supabaseAdmin();
    const business = await getBusinessBySlug(supabase, slug);
    if (!business) return { ok: false, status: 404, error: "Business not found" };

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("business_id", business.id)
      .eq("order_number", number)
      .single();

    if (error || !order) {
      return { ok: false, status: 404, error: "Order not found" };
    }

    await signPhotos(supabase, order);
    const safeOrder = stripSensitiveOrderFields(order);

    let verticalEmoji: string | null = null;
    let verticalSlug: string | null = null;
    if (business.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("emoji, slug")
        .eq("id", business.vertical_id)
        .single();
      if (vertical) {
        verticalEmoji = vertical.emoji;
        verticalSlug = vertical.slug;
      }
    }

    // Compose fruver advertising blocks from sanitized public data (R4).
    // Only for the fruver vertical; buildAdvertisingBlocks returns empty
    // blocks for any other vertical, so the ticket renders nothing extra.
    let advertising: AdvertisingBlocks | undefined;
    if (verticalSlug === "fruver") {
      const [{ data: products }, { data: promotions }] = await Promise.all([
        supabase.from("products").select("*").eq("business_id", business.id),
        supabase.from("promotions").select("*").eq("business_id", business.id).eq("active", true)
      ]);
      advertising = buildAdvertisingBlocks({
        vertical_slug: "fruver",
        products: products || [],
        promotions: promotions || [],
        promotionsConfig: business.promotions_config || null,
        now: new Date()
      });
    }

    let loyalty: any = null;
    if (order.customer_phone && business.loyalty_config?.enabled !== false) {
      try {
        const result = await getLoyaltySummary(supabase, order.customer_phone, business.id);
        if (result.success) loyalty = result.summary;
      } catch (err: any) {
        console.error("[public-ticket-data] loyalty summary error:", err.message);
      }
    }

    let approval: any = null;
    try {
      const { data: appr } = await supabase
        .from("approval_requests")
        .select("id, amount, description, status, token, expires_at")
        .eq("order_id", order.id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (appr && new Date(appr.expires_at) > new Date()) {
        approval = {
          id: appr.id,
          amount: Number(appr.amount),
          description: appr.description || "",
          token: appr.token,
          expires_at: appr.expires_at
        };
      }
    } catch {
      // No pending approval or table not present yet — ignore.
    }

    return {
      ok: true,
      status: 200,
      data: {
        orders: [safeOrder],
        approval,
        business: {
          name: business.name,
          phone: business.phone,
          slug: business.slug,
          color: business.color || null,
          logo_url: business.logo_url || null,
          plan: business.plan || "free",
          status_flow_config: business.status_flow_config || [],
          custom_fields_config: business.custom_fields_config || [],
          loyalty_config: business.loyalty_config || { enabled: true, target: 5 },
          vertical_emoji: verticalEmoji,
          vertical_slug: verticalSlug,
          payment_config: business.payment_config || {}
        },
        loyalty,
        advertising
      }
    };
  } catch (err: any) {
    return { ok: false, status: 500, error: err.message };
  }
}
