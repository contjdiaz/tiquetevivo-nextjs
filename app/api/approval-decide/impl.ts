/**
 * Approval flow for TiqueteVivo.
 * GET: validate token and return the quote. POST: decide (public) or generate (authenticated).
 */
import crypto from "crypto";
import { json, parseBody, getClientIp, supabaseAdmin, requireAuth } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import { sendWhatsAppMessage, logWhatsAppMessage } from "@/lib/api/_whatsapp";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function handleGet(event: NetlifyEvent): Promise<NetlifyResponse> {
  try {
    const params = event.queryStringParameters || {};
    const { id, token } = params;
    if (!id || !token) return json(404, { error: "not_found" });

    const supabase = supabaseAdmin();
    const { data: req, error } = await supabase
      .from("approval_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !req) return json(404, { error: "not_found" });
    if (!safeCompareUUIDs(token, req.token)) return json(404, { error: "not_found" });

    if (req.status !== "PENDING") {
      return json(200, { already_decided: true, status: req.status });
    }
    if (new Date(req.expires_at) < new Date()) {
      return json(403, { error: "expired" });
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", req.business_id)
      .single();

    return json(200, {
      approval: {
        id: req.id,
        amount: Number(req.amount),
        description: req.description || "",
        status: req.status,
        business_name: business?.name || ""
      }
    });
  } catch (err: any) {
    console.error("[approval-decide] GET error:", err.message);
    return json(500, { error: "Internal server error" });
  }
}

async function handleDecide(event: NetlifyEvent, body: any): Promise<NetlifyResponse> {
  const { id, token, decision } = body;
  if (!id || !token) return json(404, { error: "not_found" });
  if (decision !== "approve" && decision !== "reject") {
    return json(400, { error: "invalid_decision" });
  }

  const supabase = supabaseAdmin();
  const { data: req, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !req) return json(404, { error: "not_found" });
  if (!safeCompareUUIDs(token, req.token)) return json(404, { error: "not_found" });

  if (req.status !== "PENDING") {
    return json(200, { success: true, status: req.status, idempotent: true });
  }
  if (new Date(req.expires_at) < new Date()) {
    return json(403, { error: "expired" });
  }

  const newStatus = decision === "approve" ? "APPROVED" : "REJECTED";
  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("approval_requests")
    .update({ status: newStatus, decided_at: now, decided_ip: getClientIp(event) })
    .eq("id", req.id)
    .eq("status", "PENDING")
    .select()
    .single();

  if (updErr || !updated) {
    const { data: fresh } = await supabase
      .from("approval_requests")
      .select("status")
      .eq("id", req.id)
      .single();
    return json(200, { success: true, status: fresh?.status || newStatus, idempotent: true });
  }

  await notifyDecision(supabase, req, newStatus);

  return json(200, { success: true, status: newStatus });
}

async function handleGenerate(event: NetlifyEvent, body: any): Promise<NetlifyResponse> {
  const { order_id: orderId, business_id: businessId, amount, description } = body;
  if (!orderId || !businessId) {
    return json(400, { error: "order_id and business_id are required" });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) {
    return json(400, { error: "invalid_amount" });
  }

  const supabase = supabaseAdmin();
  const authResult = await requireAuth(supabase, event, {
    permission: "update_order",
    businessId
  });
  if (authResult.error) return authResult.error;

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_name, customer_phone, order_number, status")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();

  if (orderErr || !order) return json(404, { error: "not_found" });

  const now = new Date().toISOString();
  await supabase
    .from("approval_requests")
    .update({ invalidated_at: now, status: "EXPIRED" })
    .eq("order_id", orderId)
    .eq("status", "PENDING");

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();

  const { data: created, error: insErr } = await supabase
    .from("approval_requests")
    .insert({
      order_id: orderId,
      business_id: businessId,
      amount: amt,
      description: description || null,
      token,
      expires_at: expiresAt,
      created_by: authResult.user.id
    })
    .select()
    .single();

  if (insErr) {
    console.error("[approval-decide] insert failed:", insErr.message);
    return json(500, { error: "Internal server error" });
  }

  const siteUrl = process.env.URL || process.env.SITE_URL || "https://tiquetevivo.com";
  const approvalLink = `${siteUrl}/aprobar?id=${created.id}&token=${token}`;

  try {
    const { data: business } = await supabase
      .from("businesses")
      .select("name, whatsapp_templates_config")
      .eq("id", businessId)
      .single();

    const template = selectTemplate("approval_requested", business?.whatsapp_templates_config || null, null);
    const messageText = renderTemplate(
      template,
      {
        customer_name: order.customer_name,
        order_number: order.order_number,
        approval_amount: amt,
        approval_description: description || "",
        approval_link: approvalLink
      },
      { name: business?.name || "" }
    );

    const sendResult = await sendWhatsAppMessage({ to: order.customer_phone, text: messageText });
    await logWhatsAppMessage(supabase, {
      orderId,
      businessId,
      phone: order.customer_phone,
      templateName: "approval_requested",
      messageBody: messageText,
      metaMessageId: sendResult.messageId || null,
      status: sendResult.success ? "SENT" : sendResult.dryRun ? "DRY_RUN" : "FAILED",
      errorMessage: sendResult.success || sendResult.dryRun ? null : sendResult.error || "Unknown"
    });
  } catch (waErr: any) {
    console.error("[approval-decide] WhatsApp error:", waErr.message);
  }

  return json(200, { approval_id: created.id, approval_link: approvalLink, token, expires_at: expiresAt });
}

async function notifyDecision(supabase: any, req: any, status: string) {
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("customer_name, customer_phone, order_number")
      .eq("id", req.order_id)
      .single();
    if (!order) return;

    const { data: business } = await supabase
      .from("businesses")
      .select("name, whatsapp_templates_config")
      .eq("id", req.business_id)
      .single();

    const decisionLabel = status === "APPROVED" ? "Aprobada" : "Rechazada";
    const template = selectTemplate("approval_decided", business?.whatsapp_templates_config || null, null);
    const messageText = renderTemplate(
      template,
      {
        customer_name: order.customer_name,
        order_number: order.order_number,
        approval_decision: decisionLabel
      },
      { name: business?.name || "" }
    );

    const sendResult = await sendWhatsAppMessage({ to: order.customer_phone, text: messageText });
    await logWhatsAppMessage(supabase, {
      orderId: req.order_id,
      businessId: req.business_id,
      phone: order.customer_phone,
      templateName: "approval_decided",
      messageBody: messageText,
      metaMessageId: sendResult.messageId || null,
      status: sendResult.success ? "SENT" : sendResult.dryRun ? "DRY_RUN" : "FAILED",
      errorMessage: sendResult.success || sendResult.dryRun ? null : sendResult.error || "Unknown"
    });
  } catch (err: any) {
    console.error("[approval-decide] notifyDecision error:", err.message);
  }
}

async function handlePost(event: NetlifyEvent): Promise<NetlifyResponse> {
  try {
    const body = parseBody(event);
    if (body.action === "decide") return handleDecide(event, body);
    if (body.action === "generate") return handleGenerate(event, body);
    return json(400, { error: "invalid_action" });
  } catch (err: any) {
    console.error("[approval-decide] POST error:", err.message);
    return json(500, { error: "Internal server error" });
  }
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const clientIp = getClientIp(event);
  if (!clientIp || clientIp === "unknown") {
    return json(400, { error: "ip_required" });
  }

  const rate = checkRateLimit(`${clientIp}:approval-decide`, 30, 60000);
  if (!rate.allowed) {
    return {
      statusCode: 429,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfter)
      },
      body: JSON.stringify({ error: "rate_limited" })
    };
  }

  if (event.httpMethod === "GET") return handleGet(event);
  return handlePost(event);
}

function safeCompareUUIDs(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(String(a), "utf8");
    const bufB = Buffer.from(String(b), "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
