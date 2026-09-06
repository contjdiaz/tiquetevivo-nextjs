/**
 * Payment Validation for TiqueteVivo.
 * Validates order payment eligibility and serves the dynamic payment page.
 */
import { json, getClientIp, supabaseAdmin } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handleGet(event: NetlifyEvent): Promise<NetlifyResponse> {
  try {
    const params = event.queryStringParameters || {};
    const orderId = params.order_id;
    const token = params.token;

    if (!orderId || !token) {
      return json(404, { error: "not_found" });
    }

    const supabase = supabaseAdmin();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, items_text, total, paid, status, business_id, ticket_token")
      .eq("id", orderId)
      .eq("ticket_token", token)
      .single();

    if (orderError || !order) {
      return json(404, { error: "not_found" });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", order.business_id)
      .single();

    const businessName = business?.name || "";

    const total = Number(order.total || 0);
    const paid = Number(order.paid || 0);
    const balance = Math.max(0, total - paid);

    const cancelled = order.status === "CANCELLED";
    const paidInFull = balance === 0;

    return json(200, {
      order: {
        order_number: order.order_number,
        items_text: order.items_text,
        total,
        paid,
        balance,
        status: order.status,
        business_name: businessName
      },
      cancelled,
      paid_in_full: paidInFull,
      valid: true
    });
  } catch (error: any) {
    console.error("[validate-payment] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const clientIp = getClientIp(event);
  if (!clientIp || clientIp === "unknown") {
    return json(400, { error: "ip_required" });
  }

  if (event.httpMethod === "GET") {
    const rateLimitKey = `${clientIp}:validate-payment`;
    const rateResult = checkRateLimit(rateLimitKey, 20, 60000);

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

    return handleGet(event);
  }

  return json(405, { error: "Method not allowed" });
}

export const GET = netlifyHandler(handler);
export const POST = netlifyHandler(handler);