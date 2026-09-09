/**
 * Importador_Inventario — import-inventory endpoint (fruver).
 *
 * POST /api/import-inventory
 * Body: { business_id, url }
 *
 * Downloads a Google Sheets published-as-CSV URL and treats it as the source
 * of truth for the business catalog: creates products for new rows, updates
 * matched ones and deactivates (`active = false`, never deletes) products that
 * no longer appear in the sheet. See `.kiro/specs/fruver-sheets-inventory-import`.
 *
 * Flow:
 *   1. Require `manage_business` permission scoped to `business_id`.
 *   2. Resolve the business and verify it belongs to the fruver vertical.
 *   3. Validate the URL (https + allowed Google host → SSRF prevention).
 *   4. Download the CSV with a timeout and max-size guard.
 *   5. Parse the CSV (required columns `nombre`/`unidad`/`precio`).
 *   6. Plan creates/updates/deactivations and apply them.
 *   7. Return a Resumen_Importacion (created/updated/deactivated + invalid rows).
 */

import {
  json,
  parseBody,
  supabaseAdmin,
  requireAuth
} from "@/lib/api/_utils";
import {
  ALLOWED_CSV_HOSTS,
  CSV_DOWNLOAD_TIMEOUT_MS,
  MAX_CSV_BYTES,
  parseInventoryRows,
  planInventoryImport,
  validateCsvUrl,
  applyRowBoolean
} from "@/lib/fruver/inventory-import";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

/** Downloads the published CSV with a timeout and size cap (R4). */
async function downloadCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CSV_DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      throw new Error(`La descarga del CSV falló (HTTP ${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_CSV_BYTES) {
      throw new Error("La hoja excede el tamaño permitido");
    }
    return new TextDecoder("utf-8").decode(buffer);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("La descarga del CSV expiró");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: true, message: "Method not allowed" });

  try {
    const supabase = supabaseAdmin();
    const body = parseBody(event);

    const businessId = body.business_id;
    if (!businessId || typeof businessId !== "string") {
      return json(400, { error: true, message: "business_id is required" });
    }

    const authResult = await requireAuth(supabase, event, {
      permission: "manage_business",
      businessId
    });
    if (authResult.error) return authResult.error;

    // --- Resolve business + fruver vertical verification ---
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, vertical_id")
      .eq("id", businessId)
      .maybeSingle();
    if (businessError) {
      return json(500, { error: true, message: `DB error: ${businessError.message}` });
    }
    if (!business) {
      return json(404, { error: true, message: "Business not found" });
    }
    if (business.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("slug")
        .eq("id", business.vertical_id)
        .single();
      if (vertical?.slug !== "fruver") {
        return json(404, { error: true, message: "Business not found" });
      }
    }

    // --- URL validation (R3) ---
    const urlResult = validateCsvUrl(body.url);
    if (!urlResult.valid) {
      return json(400, {
        error: true,
        message: urlResult.reasons.join(". "),
        field: "url"
      });
    }

    // --- Download (R4) ---
    let csvText: string;
    try {
      csvText = await downloadCsv(body.url.trim());
    } catch (downloadError: any) {
      return json(400, {
        error: true,
        message: downloadError?.message || "No se pudo descargar la hoja"
      });
    }

    // --- Parse (R5) ---
    const parsed = parseInventoryRows(csvText);
    if (parsed.parseError) {
      return json(400, { error: true, message: parsed.parseError, field: "csv" });
    }
    if (parsed.missingColumns.length > 0) {
      return json(400, {
        error: true,
        message: `Faltan columnas obligatorias: ${parsed.missingColumns.join(", ")}`,
        field: "csv"
      });
    }

    // --- Load current catalog and plan (R7, R8) ---
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("*")
      .eq("business_id", business.id);
    if (productsError) throw productsError;

    const { plan, invalid } = planInventoryImport(parsed.rows, products || []);

    // --- Apply changes (R8) ---
    const now = new Date().toISOString();

    for (const row of plan.creates) {
      const { error: insertError } = await supabase.from("products").insert({
        business_id: business.id,
        name: row.name,
        unit: row.unit,
        day_price: row.price,
        photo_url: row.photo_url,
        is_seasonal: applyRowBoolean(row.is_seasonal, false),
        active: applyRowBoolean(row.active, true),
        created_at: now,
        updated_at: now
      });
      if (insertError) throw insertError;
    }

    for (const { row, product } of plan.updates) {
      const updates: Record<string, unknown> = {
        name: row.name,
        unit: row.unit,
        day_price: row.price,
        updated_at: now
      };
      if (row.photo_url) updates.photo_url = row.photo_url;
      if (row.is_seasonal !== null) updates.is_seasonal = row.is_seasonal;
      if (row.active !== null) updates.active = row.active;

      const { error: updateError } = await supabase
        .from("products")
        .update(updates)
        .eq("id", product.id)
        .eq("business_id", business.id);
      if (updateError) throw updateError;
    }

    if (plan.deactivateIds.length > 0) {
      const { error: deactivateError } = await supabase
        .from("products")
        .update({ active: false, updated_at: now })
        .in("id", plan.deactivateIds)
        .eq("business_id", business.id);
      if (deactivateError) throw deactivateError;
    }

    // --- Resumen_Importacion (R9) ---
    return json(200, {
      created: plan.creates.length,
      updated: plan.updates.length,
      deactivated: plan.deactivateIds.length,
      invalid,
      source_host: new URL(body.url.trim()).hostname
    });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}