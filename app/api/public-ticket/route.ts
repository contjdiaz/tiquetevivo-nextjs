/**
 * GET /api/public-ticket?slug=<slug>&number=<order_number>
 * Public, unauthenticated endpoint that returns a SINGLE order plus the
 * business public config, for the customer-facing ticket page.
 */
import { getBusinessBySlug, getClientIp, json, supabaseAdmin } from "@/lib/api/_utils";
import { getLoyaltySummary } from "@/lib/api/_loyalty";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { getSignedPhotoUrl } from "@/lib/api/_photo-storage";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function signPhotos(supabase: any, order: any) {
  if (order.intake_photo_url) {
    try {
      order.intake_photo_url = await getSignedPhotoUrl(supabase, order.intake_photo_url);
    } catch (err: any) {
      console.error("[Photo] intake sign failed:", err.message);
    }
  }
  if (order.delivery_photo_url) {
    try {
      order.delivery_photo_url = await getSignedPhotoUrl(supabase, order.delivery_photo_url);
    } catch (err: any) {
      console.error("[Photo] delivery sign failed:", err.message);
    }
  }
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
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

    const supabase = supabaseAdmin();
    const business = await getBusinessBySlug(supabase, slug);
    if (!business) return json(404, { error: "Business not found" });

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("business_id", business.id)
      .eq("order_number", number)
      .single();

    if (error || !order) {
      return json(404, { error: "Order not found" });
    }

    await signPhotos(supabase, order);

    let verticalEmoji: string | null = null;
    if (business.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("emoji")
        .eq("id", business.vertical_id)
        .single();
      if (vertical) verticalEmoji = vertical.emoji;
    }

    let loyalty: any = null;
    if (order.customer_phone && business.loyalty_config?.enabled !== false) {
      try {
        const result = await getLoyaltySummary(supabase, order.customer_phone, business.id);
        if (result.success) loyalty = result.summary;
      } catch (err: any) {
        console.error("[Loyalty] summary error:", err.message);
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
          token: appr.token
        };
      }
    } catch {
      // No pending approval or table not present yet — ignore.
    }

    return json(200, {
      orders: [order],
      approval,
      business: {
        name: business.name,
        phone: business.phone,
        slug: business.slug,
        color: business.color || null,
        plan: business.plan || "free",
        status_flow_config: business.status_flow_config || [],
        custom_fields_config: business.custom_fields_config || [],
        loyalty_config: business.loyalty_config || { enabled: true, target: 5 },
        vertical_emoji: verticalEmoji,
        payment_config: business.payment_config || {}
      },
      loyalty
    });
  } catch (err: any) {
    return json(500, { error: err.message });
  }
}

export const GET = netlifyHandler(handler);