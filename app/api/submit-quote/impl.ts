/**
 * Gestor_Cotizaciones — submit-quote endpoint (R6, R7, R10) for "fruver".
 *
 * POST /api/submit-quote
 * Body: { slug, lines: [{ product_id, qty }], phone?, name?, from_frequent_list? }
 *
 * Flow:
 *   1. Rate limit per client IP (R10.1) and validate input before DB (R10.4).
 *   2. Resolve the business by slug and verify the fruver vertical.
 *   3. Rebuild lines from the CURRENT catalog (authoritative price/name/unit),
 *      accepting only active products with qty > 0.
 *   4. Recalculate the Total_Estimado on the server (R6.1, R7.1).
 *   5. Optionally upsert the customer WITHOUT incrementing orders (R6.5).
 *   6. Persist the quote with status "enviada" and created_at.
 *   7. Build a readable WhatsApp message and send it; on failure/unavailable
 *      API, return a wa.me fallback link (R6.2, R6.3, R6.4).
 */

import {
  json,
  parseBody,
  supabaseAdmin,
  getClientIp,
  slugify
} from "@/lib/api/_utils";
import { checkRateLimit } from "@/lib/api/_rate-limiter";
import { validatePhone } from "@/lib/api/_validators";
import { reconcileFrequentList } from "@/lib/fruver/quote-calculator";
import { computeEstimatedTotal } from "@/lib/fruver/quote-calculator";
import { upsertCustomer } from "@/lib/api/_customers";
import {
  sendWhatsAppMessage,
  buildFallbackLink,
  logWhatsAppMessage
} from "@/lib/api/_whatsapp";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import type { QuoteLine } from "@/lib/fruver/types";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;

/** Format currency as an integer COP-style string (no decimals). */
function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

/** Build a readable, complete quote message: product, qty, unit and total (R6.4). */
function buildItemsText(lines: QuoteLine[]): string {
  return lines
    .map((l) => `• ${l.name} x ${l.qty} ${l.unit} — ${formatMoney(l.day_price * l.qty)}`)
    .join("\n");
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);

    // --- Validate input before DB access (R10.4) ---
    const slug = slugify(body.slug);
    if (!slug) {
      return json(400, { error: true, message: "slug is required" });
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : null;
    if (!rawLines || rawLines.length === 0) {
      return json(400, { error: true, message: "lines is required and must be a non-empty array" });
    }

    // Each line must reference a product and carry a positive numeric qty.
    const savedLines: { product_id: string; qty: number }[] = [];
    for (const line of rawLines) {
      const productId = line?.product_id;
      const qty = typeof line?.qty === "number" ? line.qty : Number(line?.qty);
      if (!productId || typeof productId !== "string") {
        return json(400, { error: true, message: "each line must include a string product_id", field: "product_id" });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return json(400, { error: true, message: "each line must include a qty greater than 0", field: "qty" });
      }
      savedLines.push({ product_id: productId, qty });
    }

    // Optional phone.
    let phone: string | null = null;
    if (body.phone != null && String(body.phone).trim() !== "") {
      const phoneResult = validatePhone(body.phone);
      if (!phoneResult.valid) {
        return json(400, { error: true, message: phoneResult.error, field: "phone" });
      }
      phone = phoneResult.value!;
    }

    // --- Rate limiting (R10.1) ---
    const ip = getClientIp(event);
    const rl = checkRateLimit(`${ip}:submit-quote`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.allowed) {
      return json(429, { error: true, message: "Too many requests", retryAfter: rl.retryAfter });
    }

    const supabase = supabaseAdmin();

    // --- Resolve business and verify fruver vertical ---
    // Query directly so a genuine DB/auth error surfaces as 500 instead of
    // being masked as a 404 "not found".
    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (businessError) {
      return json(500, { error: true, message: `DB error: ${businessError.message}` });
    }
    if (!business) {
      return json(404, { error: true, message: "Business not found" });
    }

    let vertical: any = null;
    if (business.vertical_id) {
      const { data } = await supabase
        .from("verticals")
        .select("slug, whatsapp_templates_default")
        .eq("id", business.vertical_id)
        .single();
      vertical = data;
    }
    if (vertical?.slug !== "fruver") {
      return json(404, { error: true, message: "Business not found" });
    }

    // --- Load current catalog and rebuild lines authoritatively (R6.1, R7.1) ---
    const { data: catalog, error: catalogError } = await supabase
      .from("products")
      .select("*")
      .eq("business_id", business.id);
    if (catalogError) throw catalogError;

    const { lines, unavailable } = reconcileFrequentList(savedLines, catalog || []);
    if (lines.length === 0) {
      return json(400, {
        error: true,
        message: "None of the selected products are available",
        unavailable
      });
    }

    const estimatedTotal = computeEstimatedTotal(lines);

    // --- Optional customer link WITHOUT incrementing orders (R6.5) ---
    let customerId: string | null = null;
    if (phone) {
      const customer = await upsertCustomer(supabase, {
        businessId: business.id,
        name: body.name || null,
        phone,
        incrementOrder: false
      });
      customerId = customer.id;
    }

    // --- Persist the quote (status "enviada") (R6.1, R7.1) ---
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        business_id: business.id,
        customer_id: customerId,
        lines,
        estimated_total: estimatedTotal,
        status: "enviada",
        from_frequent_list: body.from_frequent_list === true
      })
      .select()
      .single();
    if (quoteError) throw quoteError;

    // --- Build the readable WhatsApp message (R6.4) ---
    const itemsText = buildItemsText(lines);
    const verticalTemplates = vertical?.whatsapp_templates_default || null;
    const businessTemplates = business.whatsapp_templates_config || null;
    const template = selectTemplate("quote_sent", businessTemplates, verticalTemplates);
    const messageBody = renderTemplate(
      template,
      {
        customer_name: body.name || "Cliente",
        items_text: itemsText,
        total: formatMoney(estimatedTotal)
      },
      { name: business.name }
    );

    // Destination: business phone (customer sends quote to the store).
    const destination = business.phone || phone || "";

    // --- Send WhatsApp; provide fallback on failure/unavailable API (R6.2, R6.3) ---
    let whatsappResult: any = null;
    let fallbackLink: string | null = null;
    try {
      whatsappResult = await sendWhatsAppMessage({ to: destination, text: messageBody });
      if (!whatsappResult?.success) {
        fallbackLink = whatsappResult?.fallbackLink || buildFallbackLink(destination, messageBody);
      }
    } catch {
      fallbackLink = buildFallbackLink(destination, messageBody);
    }

    // --- Log the attempt (best-effort) ---
    try {
      await logWhatsAppMessage(supabase, {
        businessId: business.id,
        phone: destination,
        templateName: "quote_sent",
        messageBody,
        metaMessageId: whatsappResult?.messageId || null,
        status: whatsappResult?.success ? "sent" : "failed",
        errorMessage: whatsappResult?.success ? null : whatsappResult?.error || "unavailable"
      });
    } catch {
      /* logging must never block the response */
    }

    return json(201, {
      quote_id: quote.id,
      estimated_total: estimatedTotal,
      lines,
      unavailable,
      whatsapp_sent: Boolean(whatsappResult?.success),
      fallback_link: fallbackLink,
      message: messageBody
    });
  } catch (error: any) {
    return json(500, { error: true, message: error.message });
  }
}
