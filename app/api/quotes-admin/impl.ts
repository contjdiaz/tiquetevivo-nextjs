/**
 * Gestor_Cotizaciones (panel) — quotes-admin endpoint (R7).
 *
 * Provides operator-panel operations over persisted Quotes for the "fruver"
 * vertical, following the platform's existing handler pattern (see
 * manage-products / manage-business):
 *
 *   * `list`           — return the Quotes of the authenticated business,
 *                        scoped by `business_id` (R7.4, R12.1, R12.2).
 *   * `mark-converted` — transition a Quote to status `"convertida"`, stamping
 *                        `converted_at` and optionally linking an `order_id`
 *                        (R7.2, R7.3). The record is never deleted (R7.5).
 *
 * All reads/writes are scoped by `business_id` for multi-tenant isolation.
 * Authorization requires the `manage_business` permission.
 */

import { json, parseBody, supabaseAdmin, requireAuth } from "@/lib/api/_utils";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

type QuoteAction = "list" | "mark-converted";

const VALID_ACTIONS: QuoteAction[] = ["list", "mark-converted"];

/**
 * List Quotes for a business, most recent first (R7.4, R12.1).
 */
async function handleList(
  supabase: any,
  businessId: string
): Promise<NetlifyResponse> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return json(200, data || []);
}

/**
 * Mark a Quote as converted: status -> "convertida", stamp `converted_at`,
 * and optionally link the resulting `order_id`. The row is preserved (R7.5)
 * and the update is scoped to the owning business (R12.2).
 */
async function handleMarkConverted(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const quoteId = body.quote_id || body.quote?.id;
  if (!quoteId) {
    return json(400, { error: true, message: "quote_id is required", field: "quote_id" });
  }

  const orderId = body.order_id;
  if (orderId != null && typeof orderId !== "string") {
    return json(400, { error: true, message: "order_id must be a string", field: "order_id" });
  }

  const updates: Record<string, any> = {
    status: "convertida",
    converted_at: new Date().toISOString()
  };
  if (orderId != null && orderId !== "") {
    updates.order_id = orderId;
  }

  const { data, error } = await supabase
    .from("quotes")
    .update(updates)
    .eq("id", quoteId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error || !data) {
    return json(404, { error: true, message: "Quote not found" });
  }
  return json(200, data);
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = supabaseAdmin();
    const body = parseBody(event);
    const { action, business_id } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return json(400, { error: true, message: `action must be one of: ${VALID_ACTIONS.join(", ")}` });
    }

    if (!business_id) {
      return json(400, { error: true, message: "business_id is required" });
    }

    const authResult = await requireAuth(supabase, event, {
      permission: "manage_business",
      businessId: business_id
    });
    if (authResult.error) return authResult.error;

    if (action === "list") {
      return await handleList(supabase, business_id);
    }
    if (action === "mark-converted") {
      return await handleMarkConverted(supabase, business_id, body);
    }

    return json(400, { error: true, message: `Unsupported action: ${action}` });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
