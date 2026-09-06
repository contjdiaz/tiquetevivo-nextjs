import { getClientIp, json, parseBody, supabaseAdmin, getBusinessBySlug } from "@/lib/api/_utils";
import { validatePhone } from "@/lib/api/_validators";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { generateOTP, storeOTP, verifyOTP, checkOTPRateLimit } from "@/lib/api/_otp";
import { sendWhatsAppMessage } from "@/lib/api/_whatsapp";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

function stripSensitiveFields(order: any) {
  if (!order) return order;
  const { customer_name, customer_phone, internal_notes, notes, ...safeOrder } = order;
  return safeOrder;
}

async function handleRequestOTP(supabase: any, params: { phone: string; slug: string }): Promise<NetlifyResponse> {
  const { phone, slug } = params;

  let business: any;
  try {
    business = await getBusinessBySlug(supabase, slug);
  } catch {
    return json(200, { message: "verification_sent" });
  }

  const { count: orderCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("business_id", business.id)
    .eq("customer_phone", phone);

  if (!orderCount || orderCount === 0) {
    return json(200, { message: "verification_sent" });
  }

  const otpRateLimit = await checkOTPRateLimit(supabase, phone, business.id);
  if (!otpRateLimit.allowed) {
    return {
      statusCode: 429,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type": "application/json",
        "Retry-After": "900"
      },
      body: JSON.stringify({ error: "otp_rate_limit", retry_after: 900 })
    };
  }

  const code = generateOTP();

  const storeResult = await storeOTP(supabase, { phone, businessId: business.id, code });
  if (!storeResult.success) {
    return json(500, { error: "verification_failed" });
  }

  const sendResult = await sendWhatsAppMessage({
    to: phone,
    text: `Tu código de verificación es: ${code}. Válido por 5 minutos.`
  });

  if (!sendResult.success && !sendResult.dryRun) {
    return json(500, { error: "verification_failed" });
  }

  return json(200, { message: "verification_sent" });
}

async function handleVerifyOTP(
  supabase: any,
  params: { phone: string; slug: string; code: string }
): Promise<NetlifyResponse> {
  const { phone, slug, code } = params;

  let business: any;
  try {
    business = await getBusinessBySlug(supabase, slug);
  } catch {
    return json(400, { error: "invalid_code", remaining_attempts: 0 });
  }

  const verifyResult = await verifyOTP(supabase, { phone, businessId: business.id, code });

  if (!verifyResult.valid) {
    if (verifyResult.expired) {
      return json(400, { error: "code_expired" });
    }
    if (verifyResult.locked) {
      return json(400, { error: "code_locked" });
    }
    if (verifyResult.remainingAttempts !== undefined) {
      return json(400, { error: "invalid_code", remaining_attempts: verifyResult.remainingAttempts });
    }
    return json(400, { error: "invalid_code", remaining_attempts: 0 });
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", business.id)
    .eq("customer_phone", phone)
    .not("status", "in", '("DELIVERED","CANCELLED")')
    .order("created_at", { ascending: false })
    .limit(50);

  if (ordersError) {
    return json(500, { error: "orders_fetch_failed" });
  }

  const safeOrders = (orders || []).map(stripSensitiveFields);

  return json(200, { orders: safeOrders });
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const clientIp = getClientIp(event);
  if (!clientIp || clientIp === "unknown") {
    return json(400, { error: "ip_required" });
  }

  const rateLimitKey = `${clientIp}:ticket-recovery`;
  const rateResult = checkRateLimit(rateLimitKey, 10, 60000);
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
      body: JSON.stringify({ error: "rate_limited" })
    };
  }

  try {
    const body = parseBody(event);
    const action = body.action;

    if (!action || !["request-otp", "verify-otp"].includes(action)) {
      return json(400, { error: "invalid_action", detail: "action must be 'request-otp' or 'verify-otp'" });
    }

    const phoneResult = validatePhone(body.phone);
    if (!phoneResult.valid) {
      return json(400, { error: "invalid_phone", detail: phoneResult.error });
    }
    const phone = phoneResult.value as string;

    const slug = body.slug;
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      return json(400, { error: "invalid_slug", detail: "slug is required" });
    }

    const supabase = supabaseAdmin();

    if (action === "request-otp") {
      return await handleRequestOTP(supabase, { phone, slug });
    }

    if (action === "verify-otp") {
      const code = body.code;
      if (!code || typeof code !== "string" || code.trim() === "") {
        return json(400, { error: "invalid_code", detail: "code is required" });
      }
      return await handleVerifyOTP(supabase, { phone, slug, code: code.trim() });
    }
  } catch (error: any) {
    return json(500, { error: error.message });
  }
}

export const POST = netlifyHandler(handler);