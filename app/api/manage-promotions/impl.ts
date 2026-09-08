import { json, parseBody, supabaseAdmin, requireAuth } from "@/lib/api/_utils";
import { validateWindow, validateDiscountPercent } from "@/lib/fruver/validators";
import { getActivePromotions } from "@/lib/fruver/promotions";
import type { Promotion, PromotionType } from "@/lib/fruver/types";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

/**
 * Gestor_Promociones — CRUD over the `promotions` table for the "fruver"
 * vertical (banners, combos, discount codes).
 *
 * Actions: `create`, `update`, `deactivate`, `list`. All actions require an
 * authenticated Dueño with the `manage_business` permission on the target
 * business (R12.1). Promotions are always scoped by `business_id`.
 *
 * Rules:
 * - Validity window is validated with `validateWindow` (`ends_at >= starts_at`, R3.4).
 * - Discount percent for combos/codes is validated with `validateDiscountPercent`
 *   (closed range [0, 100], R3.5).
 * - `deactivate` sets `active = false`, keeping the row so it is excluded from
 *   the Renderizador_Publicidad (R3.6).
 * - `list` returns promotions filtered by `business_id`; with `only_active`
 *   it reuses the shared pure `getActivePromotions` to return only promotions
 *   in effect at `now` (R3.7).
 */

const VALID_PROMOTION_TYPES: PromotionType[] = ["banner", "combo", "discount_code"];

interface PromotionInput {
  type?: PromotionType;
  text?: string | null;
  discount_percent?: number | null;
  code?: string | null;
  product_ids?: string[] | null;
  starts_at?: string;
  ends_at?: string;
}

async function handleCreate(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const promotion: PromotionInput = body.promotion;

  if (!promotion || typeof promotion !== "object") {
    return json(400, { error: true, message: "promotion object is required" });
  }

  if (!promotion.type || !VALID_PROMOTION_TYPES.includes(promotion.type)) {
    return json(400, {
      error: true,
      message: `promotion.type must be one of: ${VALID_PROMOTION_TYPES.join(", ")}`,
      field: "type",
    });
  }

  // Validity window (R3.4).
  const windowResult = validateWindow(promotion.starts_at, promotion.ends_at);
  if (!windowResult.valid) {
    return json(400, { error: true, message: windowResult.error, field: windowResult.field });
  }

  // Discount percent for combos and discount codes (R3.5).
  let discountPercent: number | null = null;
  if (promotion.type === "combo" || promotion.type === "discount_code") {
    const discountResult = validateDiscountPercent(promotion.discount_percent);
    if (!discountResult.valid) {
      return json(400, { error: true, message: discountResult.error, field: discountResult.field });
    }
    discountPercent = discountResult.value ?? null;
  } else if (promotion.discount_percent != null) {
    // Optional descuento even for banners: validate if present.
    const discountResult = validateDiscountPercent(promotion.discount_percent);
    if (!discountResult.valid) {
      return json(400, { error: true, message: discountResult.error, field: discountResult.field });
    }
    discountPercent = discountResult.value ?? null;
  }

  // Type-specific required fields (R3.1, R3.2, R3.3).
  if (promotion.type === "banner" && (!promotion.text || !String(promotion.text).trim())) {
    return json(400, { error: true, message: "promotion.text is required for banner promotions", field: "text" });
  }
  if (promotion.type === "discount_code" && (!promotion.code || !String(promotion.code).trim())) {
    return json(400, { error: true, message: "promotion.code is required for discount_code promotions", field: "code" });
  }
  if (promotion.type === "combo" && (!Array.isArray(promotion.product_ids) || promotion.product_ids.length === 0)) {
    return json(400, { error: true, message: "promotion.product_ids is required for combo promotions", field: "product_ids" });
  }

  const { data, error } = await supabase
    .from("promotions")
    .insert({
      business_id: businessId,
      type: promotion.type,
      text: promotion.text ? String(promotion.text).trim() : null,
      code: promotion.code ? String(promotion.code).trim() : null,
      discount_percent: discountPercent,
      product_ids: Array.isArray(promotion.product_ids) ? promotion.product_ids : null,
      starts_at: windowResult.value!.starts_at,
      ends_at: windowResult.value!.ends_at,
      active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return json(201, data);
}

async function handleUpdate(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const { promotion_id } = body;
  const promotion: PromotionInput = body.promotion;

  if (!promotion_id) {
    return json(400, { error: true, message: "promotion_id is required" });
  }
  if (!promotion || typeof promotion !== "object") {
    return json(400, { error: true, message: "promotion object with fields to update is required" });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("promotions")
    .select("*")
    .eq("id", promotion_id)
    .eq("business_id", businessId)
    .single();

  if (fetchError || !existing) {
    return json(404, { error: true, message: "Promotion not found" });
  }

  const updates: Record<string, any> = {};

  // Validate the resulting validity window using existing values as fallback (R3.4).
  if (promotion.starts_at !== undefined || promotion.ends_at !== undefined) {
    const startsAt = promotion.starts_at !== undefined ? promotion.starts_at : existing.starts_at;
    const endsAt = promotion.ends_at !== undefined ? promotion.ends_at : existing.ends_at;
    const windowResult = validateWindow(startsAt, endsAt);
    if (!windowResult.valid) {
      return json(400, { error: true, message: windowResult.error, field: windowResult.field });
    }
    updates.starts_at = windowResult.value!.starts_at;
    updates.ends_at = windowResult.value!.ends_at;
  }

  // Validate discount percent when present (R3.5).
  if (promotion.discount_percent !== undefined) {
    const discountResult = validateDiscountPercent(promotion.discount_percent);
    if (!discountResult.valid) {
      return json(400, { error: true, message: discountResult.error, field: discountResult.field });
    }
    updates.discount_percent = discountResult.value ?? null;
  }

  if (promotion.text !== undefined) {
    updates.text = promotion.text ? String(promotion.text).trim() : null;
  }
  if (promotion.code !== undefined) {
    updates.code = promotion.code ? String(promotion.code).trim() : null;
  }
  if (promotion.product_ids !== undefined) {
    updates.product_ids = Array.isArray(promotion.product_ids) ? promotion.product_ids : null;
  }

  if (Object.keys(updates).length === 0) {
    return json(400, { error: true, message: "No fields provided to update" });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("promotions")
    .update(updates)
    .eq("id", promotion_id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) throw error;
  return json(200, data);
}

async function handleDeactivate(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const { promotion_id } = body;

  if (!promotion_id) {
    return json(400, { error: true, message: "promotion_id is required" });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("promotions")
    .select("*")
    .eq("id", promotion_id)
    .eq("business_id", businessId)
    .single();

  if (fetchError || !existing) {
    return json(404, { error: true, message: "Promotion not found" });
  }

  if (existing.active === false) {
    return json(400, { error: true, message: "Promotion is already inactive" });
  }

  // Keep the row; only flip `active` so it is excluded from the renderer (R3.6).
  const { data, error } = await supabase
    .from("promotions")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", promotion_id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) throw error;
  return json(200, data);
}

async function handleList(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const { data, error } = await supabase
    .from("promotions")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const promotions = (data || []) as Promotion[];

  // When only_active is requested, reuse the shared pure helper to return
  // promotions currently in effect at `now` (R3.7).
  if (body.only_active === true) {
    const active = getActivePromotions(promotions, new Date());
    return json(200, { promotions: active });
  }

  return json(200, { promotions });
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabase = supabaseAdmin();

    const body = parseBody(event);
    const { action, business_id } = body;

    const validActions = ["create", "update", "deactivate", "list"];
    if (!action || !validActions.includes(action)) {
      return json(400, { error: true, message: `action must be one of: ${validActions.join(", ")}` });
    }

    if (!business_id) {
      return json(400, { error: true, message: "business_id is required" });
    }

    const authResult = await requireAuth(supabase, event, {
      permission: "manage_business",
      businessId: business_id,
    });
    if (authResult.error) return authResult.error;

    if (action === "create") {
      return await handleCreate(supabase, business_id, body);
    }
    if (action === "update") {
      return await handleUpdate(supabase, business_id, body);
    }
    if (action === "deactivate") {
      return await handleDeactivate(supabase, business_id, body);
    }
    if (action === "list") {
      return await handleList(supabase, business_id, body);
    }

    return json(400, { error: true, message: `Unhandled action: ${action}` });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
