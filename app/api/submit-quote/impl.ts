/**
 * Gestor_Cotizaciones — submit-quote endpoint (R6, R7, R10) for the catalog
 * verticals.
 *
 * POST /api/submit-quote
 * Body: { slug, lines: [{ product_id | service_id, qty }], phone?, name?, from_frequent_list? }
 *
 * Flow:
 *   1. Rate limit per client IP (R10.1) and validate input before DB (R10.4).
 *   2. Resolve the business by slug and verify the vertical is registered in
 *      the engine; route to the products flow (fruver) or the services flow
 *      (lavanderia).
 *   3. Rebuild lines from the CURRENT catalog (authoritative price/name/unit),
 *      accepting only active items with qty > 0.
 *   4. Recalculate the Total_Estimado on the server (R6.1, R7.1).
 *   5. Optionally upsert the customer WITHOUT incrementing orders (R6.5).
 *   6. Persist the quote with status "enviada", created_at and the vertical
 *      slug.
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
import { computeEstimatedTotal } from "@/lib/vertical/quote-calculator";
import { upsertCustomer } from "@/lib/api/_customers";
import {
  sendWhatsAppMessage,
  buildFallbackLink,
  logWhatsAppMessage
} from "@/lib/api/_whatsapp";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import {
  SERVICE_UNITS,
  type Service,
  type ServiceQuoteLine,
  type ServiceUnit,
} from "@/lib/lavanderia/types";
import { CATALOG_VERTICALS } from "@/lib/vertical/definitions";
import type { QuoteLine } from "@/lib/fruver/types";
import type { NetlifyEvent, NetlifyResponse } from "@/lib/api/netlify-adapter";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;

/** Format currency as an integer COP-style string (no decimals). */
function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

/** Build a readable, complete quote message: item, qty, unit and total (R6.4). */
function buildItemsText(
  lines: Array<{
    name: string;
    qty: number;
    unit: string;
    day_price: number;
  }>
): string {
  return lines
    .map((l) => `• ${l.name} x ${l.qty} ${l.unit} — ${formatMoney(l.day_price * l.qty)}`)
    .join("\n");
}

/** Validates/coerces a service unit, falling back to `flat_rate`. */
function coerceServiceUnit(unit: unknown): ServiceUnit {
  return SERVICE_UNITS.includes(unit as ServiceUnit)
    ? (unit as ServiceUnit)
    : "flat_rate";
}

/** Whether the business is a "services" catalog vertical (lavanderia). */
function isServicesVertical(verticalSlug: string | null): boolean {
  return verticalSlug === "lavanderia";
}

/**
 * Products flow (fruver): rebuild quote lines from the `products` table,
 * accepting only active products with qty > 0 (R6.1, R7.1).
 */
async function handleProductQuote(
  supabase: any,
  business: any,
  savedLines: { item_id: string; qty: number }[]
): Promise<{ lines: QuoteLine[]; unavailable: string[]; estimatedTotal: number }> {
  const { data: catalog, error: catalogError } = await supabase
    .from("products")
    .select("*")
    .eq("business_id", business.id);
  if (catalogError) throw catalogError;

  if (savedLines.length === 0) {
    return { lines: [], unavailable: [], estimatedTotal: 0 };
  }

  // The fruver frequent-list reconcile expects `product_id` entries, so map the
  // generic saved lines to that shape and back.
  const productLines = savedLines.map((line) => ({
    product_id: line.item_id,
    qty: line.qty,
  }));
  const { lines: reconciled, unavailable } = reconcileFrequentList(
    productLines,
    catalog || []
  );
  return {
    lines: reconciled,
    unavailable,
    estimatedTotal: computeEstimatedTotal(reconciled),
  };
}

/**
 * Services flow (lavanderia): rebuild quote lines from `services_config`,
 * accepting only active services with qty > 0. `flat_rate` services are forced
 * to a single quantity because their price covers the whole service.
 */
function handleServiceQuote(
  business: any,
  savedLines: { item_id: string; qty: number }[]
): { lines: ServiceQuoteLine[]; unavailable: string[]; estimatedTotal: number } {
  const services: Service[] = Array.isArray(business.services_config)
    ? business.services_config
    : [];
  const activeByIndex = new Map<string, Service>();
  services.forEach((service, index) => {
    if (service.active !== false) {
      activeByIndex.set(`svc-${index}`, service);
    }
  });

  const lines: ServiceQuoteLine[] = [];
  const unavailable: string[] = [];

  for (const entry of savedLines) {
    const service = activeByIndex.get(entry.item_id);
    if (!service) {
      unavailable.push(entry.item_id);
      continue;
    }
    const unit = coerceServiceUnit(service.unit);
    const qty = unit === "flat_rate" ? 1 : entry.qty;
    lines.push({
      service_id: entry.item_id,
      name: service.name || "Servicio",
      unit,
      day_price: service.default_price,
      qty,
    });
  }

  return { lines, unavailable, estimatedTotal: computeEstimatedTotal(lines) };
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

    // Each line must reference an item (product or service) and carry a
    // positive numeric qty.
    const savedLines: { item_id: string; qty: number }[] = [];
    for (const line of rawLines) {
      const itemId = line?.item_id ?? line?.product_id ?? line?.service_id;
      const qty = typeof line?.qty === "number" ? line.qty : Number(line?.qty);
      if (!itemId || typeof itemId !== "string") {
        return json(400, { error: true, message: "each line must include a string item_id", field: "item_id" });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return json(400, { error: true, message: "each line must include a qty greater than 0", field: "qty" });
      }
      savedLines.push({ item_id: itemId, qty });
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

    // --- Resolve business and verify vertical registration ---
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
    const verticalSlug = vertical?.slug || null;
    if (!verticalSlug || !CATALOG_VERTICALS.includes(verticalSlug)) {
      return json(404, { error: true, message: "Business not found" });
    }

    // --- Route by vertical: products (fruver) vs services (lavanderia) ---
    if (isServicesVertical(verticalSlug)) {
      const { lines, unavailable, estimatedTotal } = handleServiceQuote(
        business,
        savedLines
      );
      if (lines.length === 0) {
        return json(400, {
          error: true,
          message: "None of the selected services are available",
          unavailable
        });
      }

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

      // --- Persist the quote (status "enviada", vertical_slug) ---
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          business_id: business.id,
          customer_id: customerId,
          lines,
          estimated_total: estimatedTotal,
          status: "enviada",
          vertical_slug: verticalSlug,
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
    }

    // --- Products flow (fruver) ---
    const { lines, unavailable, estimatedTotal } = await handleProductQuote(
      supabase,
      business,
      savedLines
    );
    if (lines.length === 0) {
      return json(400, {
        error: true,
        message: "None of the selected products are available",
        unavailable
      });
    }

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

    // --- Persist the quote (status "enviada", vertical_slug) ---
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        business_id: business.id,
        customer_id: customerId,
        lines,
        estimated_total: estimatedTotal,
        status: "enviada",
        vertical_slug: verticalSlug,
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