/**
 * Payment Webhook Processor for TiqueteVivo.
 * Public endpoint — security relies on cryptographic signature verification.
 */
import { json, parseBody, supabaseAdmin, getClientIp } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { verifyWompiSignature, verifyBoldSignature, applyApprovedPayment } from "@/lib/api/_payments";
import { sendWhatsAppMessage, logWhatsAppMessage } from "@/lib/api/_whatsapp";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

function detectGateway(event: NetlifyEvent, body: any): "WOMPI" | "BOLD" | null {
  const headers = event.headers || {};
  const boldHeader = headers["x-bold-signature"] || headers["X-Bold-Signature"];
  if (boldHeader) {
    return "BOLD";
  }

  if (body && body.data && body.data.transaction && body.signature) {
    return "WOMPI";
  }

  return null;
}

function extractWompiData(body: any) {
  const tx = body?.data?.transaction;
  if (!tx) return null;

  return {
    gatewayTxId: String(tx.id),
    reference: tx.reference,
    amount: Number(tx.amount_in_cents) / 100,
    status: (tx.status || "").toUpperCase()
  };
}

function extractBoldData(body: any) {
  if (!body || !body.transaction_id) return null;

  return {
    gatewayTxId: String(body.transaction_id),
    reference: body.reference,
    amount: Number(body.amount),
    status: (body.status || "").toUpperCase()
  };
}

async function resolveOrderFromReference(supabase: any, reference: string): Promise<string | null> {
  if (!reference) return null;

  const uuidMatch = reference.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (uuidMatch) {
    const { data } = await supabase
      .from("orders")
      .select("id")
      .eq("id", uuidMatch[1])
      .maybeSingle();
    if (data) return data.id;
  }

  const { data: orderByRef } = await supabase
    .from("payments")
    .select("order_id")
    .eq("gateway_transaction_id", reference)
    .maybeSingle();
  if (orderByRef) return orderByRef.order_id;

  return null;
}

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  const clientIp = getClientIp(event);
  const rateResult = checkRateLimit(`${clientIp}:payments-webhook`, 60, 60000);
  if (!rateResult.allowed) {
    return {
      statusCode: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rateResult.retryAfter)
      },
      body: JSON.stringify({ error: "Too many requests" })
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = parseBody(event);
    const rawPayload = body;

    const gateway = detectGateway(event, body);
    if (!gateway) {
      return json(400, { error: "Unable to detect payment gateway" });
    }

    let signatureResult: { valid: boolean; error?: string };

    if (gateway === "WOMPI") {
      const integritySecret = process.env.WOMPI_EVENTS_SECRET || process.env.WOMPI_INTEGRITY_SECRET;
      signatureResult = verifyWompiSignature(body, integritySecret as string);
    } else {
      const boldSecret = process.env.BOLD_SECRET;
      signatureResult = verifyBoldSignature(event, boldSecret as string);
    }

    if (!signatureResult.valid) {
      console.warn(`[payments-webhook] Invalid ${gateway} signature:`, signatureResult.error);
      return json(401, { error: "Invalid signature" });
    }

    const paymentData = gateway === "WOMPI"
      ? extractWompiData(body)
      : extractBoldData(body);

    if (!paymentData) {
      return json(400, { error: "Unable to extract payment data from payload" });
    }

    const { gatewayTxId, reference, amount, status } = paymentData;

    const supabase = supabaseAdmin();

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id, status")
      .eq("gateway_transaction_id", gatewayTxId)
      .maybeSingle();

    if (existingPayment) {
      return json(200, { message: "Already processed", payment_id: existingPayment.id });
    }

    const orderId = await resolveOrderFromReference(supabase, reference);

    if (!orderId) {
      await supabase.from("payments").insert({
        order_id: null,
        business_id: null,
        gateway,
        gateway_transaction_id: gatewayTxId,
        amount,
        currency: "COP",
        status: "MANUAL_REVIEW",
        raw_payload: rawPayload
      });

      return json(200, { message: "Order not found, recorded for manual review" });
    }

    if (status !== "APPROVED") {
      const { data: order } = await supabase
        .from("orders")
        .select("id, business_id")
        .eq("id", orderId)
        .maybeSingle();

      await supabase.from("payments").insert({
        order_id: orderId,
        business_id: order?.business_id || null,
        gateway,
        gateway_transaction_id: gatewayTxId,
        amount,
        currency: "COP",
        status: status === "DECLINED" || status === "VOIDED" || status === "PENDING" ? status : "ERROR",
        raw_payload: rawPayload
      });

      return json(200, { message: `Payment recorded with status ${status}` });
    }

    const result = await applyApprovedPayment(supabase, orderId, amount, gatewayTxId, gateway, rawPayload);

    if (!result.applied && result.reason === "duplicate") {
      return json(200, { message: "Already processed" });
    }

    if (result.applied) {
      try {
        const { data: order } = await supabase
          .from("orders")
          .select("id, business_id, customer_phone, customer_name, order_number, total, paid")
          .eq("id", orderId)
          .single();

        if (order && order.customer_phone) {
          const { data: business } = await supabase
            .from("businesses")
            .select("name, whatsapp_templates")
            .eq("id", order.business_id)
            .maybeSingle();

          const businessTemplates = business?.whatsapp_templates || null;
          const template = selectTemplate("payment_confirmed", businessTemplates, null);

          const messageText = renderTemplate(
            template,
            {
              order_number: order.order_number || orderId,
              amount_paid: amount,
              new_balance: result.new_balance
            },
            {
              name: business?.name || ""
            }
          );

          const sendResult = await sendWhatsAppMessage({
            to: order.customer_phone,
            text: messageText
          });

          const logStatus = sendResult.success ? "SENT" : sendResult.dryRun ? "DRY_RUN" : "FAILED";
          await logWhatsAppMessage(supabase, {
            orderId: orderId,
            businessId: order.business_id,
            phone: order.customer_phone,
            templateName: "payment_confirmed",
            messageBody: messageText,
            metaMessageId: sendResult.messageId || null,
            status: logStatus,
            errorMessage: sendResult.error || null
          });
        }
      } catch (whatsappError: any) {
        console.error("[payments-webhook] WhatsApp notification failed:", whatsappError.message);
      }
    }

    return json(200, {
      message: result.applied ? "Payment applied" : `Payment recorded: ${result.reason}`,
      applied: result.applied,
      status: result.status || "APPROVED",
      new_paid: result.new_paid,
      new_balance: result.new_balance
    });
  } catch (error: any) {
    console.error("[payments-webhook] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
}

export const POST = netlifyHandler(handler);