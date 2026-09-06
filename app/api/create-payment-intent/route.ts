/**
 * Create Payment Intent for TiqueteVivo.
 * Generates a checkout URL for a given order via the configured gateway (Wompi or Bold).
 */
import { json, parseBody, supabaseAdmin } from "@/lib/api/_utils";
import { createWompiCheckout, createBoldLink } from "@/lib/api/_payments";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

function generatePaymentReference(businessSlug: string, orderNumber: string | number): string {
  const ts = Date.now();
  const slug = businessSlug || "biz";
  const num = orderNumber || "0";
  return `${slug}-${num}-${ts}`;
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = parseBody(event);
    const { order_id, gateway } = body;

    if (!order_id) {
      return json(400, { error: "order_id is required" });
    }

    const selectedGateway = (gateway || process.env.PAYMENTS_GATEWAY || "WOMPI").toUpperCase();

    if (selectedGateway !== "WOMPI" && selectedGateway !== "BOLD") {
      return json(400, { error: "Invalid gateway. Must be WOMPI or BOLD" });
    }

    if (process.env.PAYMENTS_GATEWAY === "disabled") {
      return json(400, { error: "Payments are currently disabled" });
    }

    const supabase = supabaseAdmin();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, business_id, order_number, total, paid, status, customer_name, customer_phone")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return json(404, { error: "Order not found" });
    }

    const total = Number(order.total || 0);
    const paid = Number(order.paid || 0);
    const balance = Math.max(0, total - paid);

    if (balance <= 0) {
      return json(400, { error: "Order has no pending balance" });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, slug, name")
      .eq("id", order.business_id)
      .single();

    if (businessError || !business) {
      return json(404, { error: "Business not found" });
    }

    const paymentReference = generatePaymentReference(business.slug, order.order_number);

    const amountCOP = balance;
    const amountCents = Math.round(balance * 100);

    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://tiquetevivo.com";
    const redirectUrl = `${siteUrl}/tiquete?order=${order_id}&payment=complete`;

    let checkoutUrl: string | undefined;

    if (selectedGateway === "WOMPI") {
      const publicKey = process.env.WOMPI_PUBLIC_KEY;
      if (!publicKey) {
        return json(502, { error: "Wompi gateway not configured" });
      }

      const result = createWompiCheckout(paymentReference, amountCents, redirectUrl, publicKey);
      checkoutUrl = result.url;
    } else {
      const apiKey = process.env.BOLD_API_KEY;
      if (!apiKey) {
        return json(502, { error: "Bold gateway not configured" });
      }

      const description = `Pago orden #${order.order_number || order_id} - ${business.name}`;
      try {
        const result = await createBoldLink(paymentReference, amountCOP, description, apiKey);
        checkoutUrl = result.url;
      } catch (boldError: any) {
        console.error("[create-payment-intent] Bold API error:", boldError.message);
        return json(502, { error: "Gateway unavailable, try again" });
      }
    }

    if (!checkoutUrl) {
      return json(502, { error: "Gateway unavailable, try again" });
    }

    return json(200, {
      checkout_url: checkoutUrl,
      payment_reference: paymentReference,
      amount: amountCOP,
      gateway: selectedGateway
    });
  } catch (error: any) {
    console.error("[create-payment-intent] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
}

export const POST = netlifyHandler(handler);