/**
 * Coupon Redemption endpoint for TiqueteVivo.
 * POST /api/redeem-coupon — Body: { code, order_id }
 */
import { json, parseBody, supabaseAdmin } from "@/lib/api/_utils";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function getCouponByCode(supabase: any, code: string) {
  const { data, error } = await supabase
    .from("coupons")
    .select("id, business_id, code, type, value, expires_at, used_at, used_by_order_id, created_at")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) {
    console.error("[redeem-coupon] Error fetching coupon:", error.message);
    return null;
  }
  return data;
}

function validateCoupon(coupon: any): { valid: boolean; error?: string } {
  if (!coupon) {
    return { valid: false, error: "Coupon not found" };
  }

  if (coupon.used_at) {
    return { valid: false, error: "Coupon already redeemed" };
  }

  const now = new Date();
  const expiresAt = new Date(coupon.expires_at);
  if (expiresAt <= now) {
    return { valid: false, error: "Coupon expired" };
  }

  return { valid: true };
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = parseBody(event);
    const { code, order_id } = body;

    if (!code) {
      return json(400, { error: "code is required" });
    }
    if (!order_id) {
      return json(400, { error: "order_id is required" });
    }

    const supabase = supabaseAdmin();

    const coupon = await getCouponByCode(supabase, code);
    const validation = validateCoupon(coupon);

    if (!validation.valid) {
      return json(400, { redeemed: false, error: validation.error });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("id", order_id)
      .maybeSingle();

    if (orderError || !order) {
      return json(404, { redeemed: false, error: "Order not found" });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("coupons")
      .update({
        used_at: now,
        used_by_order_id: order_id
      })
      .eq("id", coupon.id)
      .is("used_at", null);

    if (updateError) {
      console.error("[redeem-coupon] Error redeeming coupon:", updateError.message);
      return json(500, { redeemed: false, error: "Failed to redeem coupon" });
    }

    const { error: logError } = await supabase
      .from("reactivation_log")
      .update({
        status: "CONVERTED",
        converted_order_id: order_id
      })
      .eq("coupon_id", coupon.id);

    if (logError) {
      console.warn("[redeem-coupon] Failed to update reactivation_log:", logError.message);
    }

    return json(200, {
      redeemed: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value)
      },
      order_id
    });
  } catch (error: any) {
    console.error("[redeem-coupon] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
}

export const POST = netlifyHandler(handler);