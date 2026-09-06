/**
 * Delivery Confirmation for TiqueteVivo.
 * GET validates delivery token; POST confirms delivery with photo or generates a token.
 */
import crypto from "crypto";
import { json, parseBody, getClientIp, supabaseAdmin, requireAuth } from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { validatePhoto, uploadPhoto } from "@/lib/api/_photo-storage";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handleGetValidation(event: NetlifyEvent): Promise<NetlifyResponse> {
  try {
    const params = event.queryStringParameters || {};
    const orderId = params.order_id;
    const token = params.token;

    if (!orderId || !token) {
      return json(404, { error: "not_found" });
    }

    const supabase = supabaseAdmin();

    const { data: tokenRow, error: tokenError } = await supabase
      .from("delivery_tokens")
      .select("*")
      .eq("order_id", orderId)
      .is("invalidated_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (tokenError || !tokenRow) {
      return json(404, { error: "not_found" });
    }

    const tokenMatch = safeCompareUUIDs(token, tokenRow.token);
    if (!tokenMatch) {
      return json(404, { error: "not_found" });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return json(403, { error: "expired", message: "Este enlace de entrega ha expirado." });
    }

    if (tokenRow.used_at) {
      return json(200, { already_delivered: true });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_name, custom_fields, total, paid, status")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return json(404, { error: "not_found" });
    }

    const cf = order.custom_fields || {};
    const deliveryAddress = cf.direccion || cf.delivery_address || cf.address || cf.direccion_entrega || "Dirección no disponible";

    const balance = Math.max(0, Number(order.total || 0) - Number(order.paid || 0));

    return json(200, {
      order: {
        customer_name: order.customer_name || "—",
        delivery_address: deliveryAddress,
        balance
      }
    });
  } catch (error: any) {
    console.error("[delivery-confirm] GET error:", error);
    return json(500, { error: "Internal server error" });
  }
}

async function handleConfirm(event: NetlifyEvent, body: any): Promise<NetlifyResponse> {
  const { order_id: orderId, token, photo } = body;

  if (!orderId || !token) {
    return json(404, { error: "not_found" });
  }

  const supabase = supabaseAdmin();

  const { data: tokenRow, error: tokenError } = await supabase
    .from("delivery_tokens")
    .select("*")
    .eq("order_id", orderId)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (tokenError || !tokenRow) {
    return json(404, { error: "not_found" });
  }

  if (!safeCompareUUIDs(token, tokenRow.token)) {
    return json(404, { error: "not_found" });
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return json(403, { error: "expired" });
  }

  if (tokenRow.used_at) {
    return json(200, { already_delivered: true });
  }

  const photoValidation = validatePhoto(photo);
  if (!photoValidation.valid) {
    return json(400, { error: "invalid_photo", detail: photoValidation.error });
  }

  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
  const ext = extMap[photoValidation.mimeType || ""] || "jpg";
  const storagePath = `${tokenRow.business_id}/${orderId}/delivery.${ext}`;

  let uploadResult: any;
  try {
    uploadResult = await uploadPhoto(supabase, photo, storagePath);
  } catch (uploadErr: any) {
    console.error("[delivery-confirm] Photo upload failed:", uploadErr.message);
    return json(500, { error: "upload_failed", message: "No se pudo subir la foto. Intenta de nuevo." });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("status_flow_config")
    .eq("id", tokenRow.business_id)
    .single();

  const statusFlow = business?.status_flow_config || [];
  const finalStatus = statusFlow.length > 0
    ? statusFlow[statusFlow.length - 1].status_key
    : "DELIVERED";

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: finalStatus,
      delivery_photo_url: uploadResult.path,
      delivery_photo_taken_at: now
    })
    .eq("id", orderId);

  if (updateError) {
    console.error("[delivery-confirm] Order update failed:", updateError);
    return json(500, { error: "update_failed", message: "No se pudo confirmar la entrega. Intenta de nuevo." });
  }

  await supabase
    .from("delivery_tokens")
    .update({ used_at: now })
    .eq("id", tokenRow.id);

  return json(200, { success: true, status: finalStatus });
}

async function handleGenerateToken(event: NetlifyEvent, body: any): Promise<NetlifyResponse> {
  const { order_id: orderId, business_id: businessId } = body;

  if (!orderId || !businessId) {
    return json(400, { error: "order_id and business_id are required" });
  }

  const supabase = supabaseAdmin();

  const authResult = await requireAuth(supabase, event, {
    permission: "update_order",
    businessId
  });
  if (authResult.error) return authResult.error;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, customer_name, custom_fields, total, paid")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();

  if (orderError || !order) {
    return json(404, { error: "not_found", message: "Pedido no encontrado" });
  }

  if (order.status === "DELIVERED" || order.status === "CANCELLED") {
    return json(400, { error: "not_eligible", message: "Esta orden no es elegible para entrega." });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("status_flow_config")
    .eq("id", businessId)
    .single();

  const statusFlow = business?.status_flow_config || [];
  const finalStatus = statusFlow.length > 0 ? statusFlow[statusFlow.length - 1].status_key : "DELIVERED";
  if (order.status === finalStatus) {
    return json(400, { error: "not_eligible", message: "Esta orden ya fue entregada." });
  }

  const now = new Date().toISOString();
  await supabase
    .from("delivery_tokens")
    .update({ invalidated_at: now })
    .eq("order_id", orderId)
    .is("used_at", null)
    .is("invalidated_at", null);

  const newToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("delivery_tokens")
    .insert({
      token: newToken,
      order_id: orderId,
      business_id: businessId,
      expires_at: expiresAt,
      created_by: authResult.user.id
    });

  if (insertError) {
    console.error("[delivery-confirm] Token insert failed:", insertError);
    return json(500, { error: "Internal server error" });
  }

  const siteUrl = process.env.URL || process.env.SITE_URL || "https://tiquetevivo.com";
  const deliveryUrl = `${siteUrl}/entrega?order_id=${orderId}&token=${newToken}`;

  return json(200, {
    delivery_url: deliveryUrl,
    token: newToken,
    expires_at: expiresAt
  });
}

async function handlePost(event: NetlifyEvent): Promise<NetlifyResponse> {
  try {
    const body = parseBody(event);
    const action = body.action;

    if (action === "confirm") {
      return handleConfirm(event, body);
    }

    if (action === "generate-token") {
      return handleGenerateToken(event, body);
    }

    return json(400, { error: "invalid_action" });
  } catch (error: any) {
    console.error("[delivery-confirm] POST error:", error);
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

  const rateLimitKey = `${clientIp}:delivery-confirm`;
  const rateResult = checkRateLimit(rateLimitKey, 15, 60000);

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

  if (event.httpMethod === "GET") {
    return handleGetValidation(event);
  }

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

export const GET = netlifyHandler(handler);
export const POST = netlifyHandler(handler);