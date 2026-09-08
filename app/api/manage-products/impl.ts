/**
 * Gestor_Catalogo — manage-products endpoint (R2).
 *
 * Handles CRUD operations over catalog Products for the "fruver" vertical,
 * following the platform's existing handler pattern (see manage-business).
 * All reads/writes are scoped by `business_id` for multi-tenant isolation
 * (R2.9, R12.1). Authorization requires the `manage_business` permission.
 */

import { randomUUID } from "crypto";
import { json, parseBody, supabaseAdmin, requireAuth } from "@/lib/api/_utils";
import { validateRequired } from "@/lib/api/_validators";
import { validateUnit, validateDayPrice } from "@/lib/fruver/validators";
import { uploadPhoto } from "@/lib/api/_photo-storage";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

type ProductAction = "create" | "update" | "deactivate" | "list";

const VALID_ACTIONS: ProductAction[] = ["create", "update", "deactivate", "list"];

/**
 * Upload an optional product photo, returning its stored path.
 * Reuses the shared photo storage mechanism (R2.6).
 */
async function storeProductPhoto(
  supabase: any,
  businessId: string,
  base64DataUrl: string
): Promise<string> {
  const mimeMatch = base64DataUrl.match(/^data:image\/([^;]+);base64,/);
  const ext = mimeMatch ? mimeMatch[1].replace("jpeg", "jpg") : "jpg";
  const storagePath = `${businessId}/products/${randomUUID()}.${ext}`;
  const uploadResult = await uploadPhoto(supabase, base64DataUrl, storagePath);
  return uploadResult.path;
}

async function handleCreate(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const product = body.product;
  if (!product || typeof product !== "object") {
    return json(400, { error: true, message: "product object is required" });
  }

  const requiredResult = validateRequired(product, ["name"]);
  if (!requiredResult.valid) {
    return json(400, { error: true, message: requiredResult.errors![0], field: "name" });
  }

  const unitResult = validateUnit(product.unit);
  if (!unitResult.valid) {
    return json(400, { error: true, message: unitResult.error, field: unitResult.field });
  }

  const priceResult = validateDayPrice(product.day_price);
  if (!priceResult.valid) {
    return json(400, { error: true, message: priceResult.error, field: priceResult.field });
  }

  let photoUrl: string | null = product.photo_url ?? null;
  if (product.photo_base64) {
    try {
      photoUrl = await storeProductPhoto(supabase, businessId, product.photo_base64);
    } catch (uploadError: any) {
      return json(500, { error: true, message: "Photo upload failed" });
    }
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: businessId,
      name: String(product.name).trim(),
      unit: unitResult.value,
      day_price: priceResult.value,
      photo_url: photoUrl,
      is_seasonal: product.is_seasonal === true,
      active: true
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
  const product = body.product;
  if (!product || typeof product !== "object") {
    return json(400, { error: true, message: "product object with fields to update is required" });
  }

  const productId = product.id || body.product_id;
  if (!productId) {
    return json(400, { error: true, message: "product.id is required", field: "id" });
  }

  const updates: Record<string, any> = {};

  if (product.name !== undefined) {
    if (typeof product.name !== "string" || !product.name.trim()) {
      return json(400, { error: true, message: "product.name must be a non-empty string", field: "name" });
    }
    updates.name = product.name.trim();
  }

  if (product.unit !== undefined) {
    const unitResult = validateUnit(product.unit);
    if (!unitResult.valid) {
      return json(400, { error: true, message: unitResult.error, field: unitResult.field });
    }
    updates.unit = unitResult.value;
  }

  if (product.day_price !== undefined) {
    const priceResult = validateDayPrice(product.day_price);
    if (!priceResult.valid) {
      return json(400, { error: true, message: priceResult.error, field: priceResult.field });
    }
    updates.day_price = priceResult.value;
  }

  if (product.is_seasonal !== undefined) {
    updates.is_seasonal = product.is_seasonal === true;
  }

  if (product.photo_base64) {
    try {
      updates.photo_url = await storeProductPhoto(supabase, businessId, product.photo_base64);
    } catch (uploadError: any) {
      return json(500, { error: true, message: "Photo upload failed" });
    }
  } else if (product.photo_url !== undefined) {
    updates.photo_url = product.photo_url;
  }

  if (Object.keys(updates).length === 0) {
    return json(400, { error: true, message: "No fields provided to update" });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", productId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error || !data) {
    return json(404, { error: true, message: "Product not found" });
  }
  return json(200, data);
}

async function handleDeactivate(
  supabase: any,
  businessId: string,
  body: any
): Promise<NetlifyResponse> {
  const productId = body.product_id || body.product?.id;
  if (!productId) {
    return json(400, { error: true, message: "product_id is required", field: "product_id" });
  }

  const { data, error } = await supabase
    .from("products")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error || !data) {
    return json(404, { error: true, message: "Product not found" });
  }
  return json(200, data);
}

async function handleList(
  supabase: any,
  businessId: string
): Promise<NetlifyResponse> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return json(200, data || []);
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
      return await handleList(supabase, business_id);
    }

    return json(400, { error: true, message: `Unsupported action: ${action}` });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
