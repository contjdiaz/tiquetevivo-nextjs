/**
 * Shared payments module for TiqueteVivo.
 * Handles gateway signature verification (Wompi, Bold),
 * payment application logic, and checkout URL/link generation.
 */

import { createHmac, createHash } from "crypto";
import type { NetlifyEvent } from "./netlify-adapter";

export function verifyWompiSignature(event: any, integritySecret: string): { valid: boolean; error?: string } {
  if (!integritySecret) {
    return { valid: false, error: "Integrity secret not configured" };
  }

  if (!event || !event.data || !event.data.transaction) {
    return { valid: false, error: "Invalid event structure: missing data.transaction" };
  }

  if (!event.signature || !event.signature.checksum) {
    return { valid: false, error: "Missing signature checksum" };
  }

  const { reference, amount_in_cents, currency, status } = event.data.transaction;

  if (!reference || amount_in_cents == null || !currency || !status) {
    return { valid: false, error: "Missing required transaction fields for signature verification" };
  }

  const concatenated = `${reference}${amount_in_cents}${currency}${status}${integritySecret}`;
  const expectedChecksum = createHash("sha256").update(concatenated).digest("hex");

  if (expectedChecksum !== event.signature.checksum) {
    return { valid: false, error: "Invalid signature checksum" };
  }

  return { valid: true };
}

export function verifyBoldSignature(
  event: NetlifyEvent,
  boldSecret: string
): { valid: boolean; error?: string } {
  if (!boldSecret) {
    return { valid: false, error: "Bold secret not configured" };
  }

  if (!event || !event.headers) {
    return { valid: false, error: "Invalid event: missing headers" };
  }

  const rawHeader = event.headers["x-bold-signature"] || event.headers["X-Bold-Signature"];
  const signature = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!signature) {
    return { valid: false, error: "Missing x-bold-signature header" };
  }

  if (!event.body) {
    return { valid: false, error: "Missing request body" };
  }

  const expectedSignature = createHmac("sha256", boldSecret).update(event.body).digest("hex");

  if (expectedSignature !== signature) {
    return { valid: false, error: "Invalid HMAC signature" };
  }

  return { valid: true };
}

export async function applyApprovedPayment(
  supabase: any,
  orderId: string,
  amount: number,
  gatewayTxId: string,
  gateway: string,
  rawPayload: any
): Promise<{ applied: boolean; new_paid?: number; new_balance?: number; reason?: string; status?: string }> {
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, status")
    .eq("gateway_transaction_id", gatewayTxId)
    .maybeSingle();

  if (existingPayment) {
    return { applied: false, reason: "duplicate", status: existingPayment.status };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, business_id, status, total, paid")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return { applied: false, reason: "order_not_found" };
  }

  if (order.status === "CANCELLED") {
    await supabase.from("payments").insert({
      order_id: orderId,
      business_id: order.business_id,
      gateway,
      gateway_transaction_id: gatewayTxId,
      amount,
      currency: "COP",
      status: "MANUAL_REVIEW",
      raw_payload: rawPayload
    });

    return { applied: false, reason: "order_cancelled", status: "MANUAL_REVIEW" };
  }

  const currentPaid = Number(order.paid || 0);
  const total = Number(order.total || 0);
  const currentBalance = Math.max(0, total - currentPaid);

  if (amount > currentBalance) {
    await supabase.from("payments").insert({
      order_id: orderId,
      business_id: order.business_id,
      gateway,
      gateway_transaction_id: gatewayTxId,
      amount,
      currency: "COP",
      status: "MANUAL_REVIEW",
      raw_payload: rawPayload
    });

    return { applied: false, reason: "manual_review", status: "MANUAL_REVIEW" };
  }

  const newPaid = currentPaid + amount;
  const newBalance = Math.max(0, total - newPaid);

  const { error: insertError } = await supabase.from("payments").insert({
    order_id: orderId,
    business_id: order.business_id,
    gateway,
    gateway_transaction_id: gatewayTxId,
    amount,
    currency: "COP",
    status: "APPROVED",
    raw_payload: rawPayload
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { applied: false, reason: "duplicate" };
    }
    return { applied: false, reason: `db_error: ${insertError.message}` };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ paid: newPaid })
    .eq("id", orderId);

  if (updateError) {
    return { applied: false, reason: `update_error: ${updateError.message}` };
  }

  return { applied: true, new_paid: newPaid, new_balance: newBalance };
}

export function createWompiCheckout(
  orderRef: string,
  amountCents: number,
  redirectUrl: string,
  publicKey: string
): { url: string; reference: string } {
  if (!publicKey) {
    throw new Error("Wompi public key not configured");
  }
  if (!orderRef || !amountCents || !redirectUrl) {
    throw new Error("orderRef, amountCents, and redirectUrl are required");
  }

  const baseUrl = "https://checkout.wompi.co/p/";
  const params = new URLSearchParams({
    "public-key": publicKey,
    currency: "COP",
    "amount-in-cents": String(Math.round(amountCents)),
    reference: orderRef,
    "redirect-url": redirectUrl
  });

  return {
    url: `${baseUrl}?${params.toString()}`,
    reference: orderRef
  };
}

export async function createBoldLink(
  orderRef: string,
  amount: number,
  description: string,
  apiKey: string
): Promise<{ url: string; reference: string }> {
  if (!apiKey) {
    throw new Error("Bold API key not configured");
  }
  if (!orderRef || !amount) {
    throw new Error("orderRef and amount are required");
  }

  const response = await fetch("https://api.bold.co/v2/payment-links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      amount: Math.round(amount),
      currency: "COP",
      description: description || `Pago orden ${orderRef}`,
      reference: orderRef,
      single_use: true
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Bold API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();

  return {
    url: data.url || data.payment_link || data.data?.url,
    reference: orderRef
  };
}