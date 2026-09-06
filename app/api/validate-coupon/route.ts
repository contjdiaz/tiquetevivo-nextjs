/**
 * Coupon Validation and Redemption for TiqueteVivo.
 * GET  /api/validate-coupon?code=ABC123 — returns coupon details if valid.
 * POST /api/validate-coupon (and /api/redeem-coupon) — redeems a coupon for an order.
 */
import { json, parseBody, supabaseAdmin, getClientIp } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function getCouponByCode(supabase: any, code: string) {
  const { data, error } = await supabase
    .from("coupons")
    .select("id, business_id, code, type, value, expires_at, used_at, used_by_order_id, created_at")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) {
    console.error("[validate-coupon] Error fetching coupon:", error.message);
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

async function handleValidate(event: NetlifyEvent): Promise<NetlifyResponse> {
  const params = event.queryStringParameters || {};
  const code = params.code;

  if (!code) {
    return json(400, { error: "code query parameter is required" });
  }

  const supabase = supabaseAdmin();
  const coupon = await getCouponByCode(supabase, code);
  const validation = validateCoupon(coupon);

  if (!validation.valid) {
    return json(400, { valid: false, error: validation.error });
  }

  return json(200, {
    valid: true,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      expires_at: coupon.expires_at,
      business_id: coupon.business_id
    }
  });
}

async function handleRedeem(event: NetlifyEvent): Promise<NetlifyResponse> {
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
    console.error("[validate-coupon] Error redeeming coupon:", updateError.message);
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
    console.warn("[validate-coupon] Failed to update reactivation_log:", logError.message);
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
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const clientIp = getClientIp(event);
  const rateResult = checkRateLimit(`${clientIp}:validate-coupon`, 20, 60000);
  if (!rateResult.allowed) {
    return {
      statusCode: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Retry-After": String(rateResult.retryAfter)
      },
      body: JSON.stringify({ error: "Too many requests" })
    };
  }

  try {
    if (event.httpMethod === "GET") {
      return await handleValidate(event);
    }

    if (event.httpMethod === "POST") {
      return await handleRedeem(event);
    }

    return json(405, { error: "Method not allowed" });
  } catch (error: any) {
    console.error("[validate-coupon] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
}

export const GET = netlifyHandler(handler);
export const POST = netlifyHandler(handler);