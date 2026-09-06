import { json, parseBody, supabaseAdmin } from "@/lib/api/_utils";
import { sendWhatsAppMessage, buildOrderMessage, buildFallbackLink, logWhatsAppMessage } from "@/lib/api/_whatsapp";
import { getBusinessConfig } from "@/lib/api/_vertical-config";
import { selectTemplate, renderTemplate } from "@/lib/api/_template-engine";
import { netlifyHandler, type NetlifyEvent, type NetlifyResponse } from "@/lib/api/netlify-adapter";

async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = parseBody(event);
    const to = body.to || body.customerPhone;

    if (!to) {
      return json(400, { error: "to (recipient phone) is required" });
    }

    let text = body.text;

    if (!text) {
      try {
        const businessId = body.business_id || body.businessId;

        if (businessId) {
          const supabase = supabaseAdmin();
          const businessConfig = await getBusinessConfig(supabase, businessId);

          const triggerEvent = body.triggerEvent || body.trigger_event || "order_created";
          const verticalTemplates = businessConfig.vertical?.whatsapp_templates_default || null;
          const businessTemplates = businessConfig.whatsapp_templates_config || null;

          const template = selectTemplate(triggerEvent, businessTemplates, verticalTemplates);

          const statusFlow = businessConfig.status_flow_config || [];
          const status = body.status || "";
          const statusEntry = statusFlow.find(
            (entry: any) => entry.status_key && entry.status_key.toUpperCase() === status.toUpperCase()
          );
          const statusLabel = statusEntry ? statusEntry.display_label : status;

          text = renderTemplate(template, {
            customer_name: body.customerName || body.customer_name || "",
            order_number: body.orderNumber || body.order_number || "",
            items_text: body.itemsText || body.items_text || "",
            total: body.total != null ? Number(body.total) : 0,
            balance: Number(body.balance ?? Math.max(0, Number(body.total || 0) - Number(body.paid || 0))),
            status_label: statusLabel,
            custom_fields: body.custom_fields || body.customFields || {}
          }, {
            name: businessConfig.name || body.businessName || body.business_name || ""
          });
        } else {
          text = buildOrderMessage(body);
        }
      } catch (templateError: any) {
        console.error("[whatsapp-sender] Template Engine error, using fallback:", templateError.message);
        text = buildOrderMessage(body);
      }
    }

    if (!text) {
      return json(400, { error: "Could not compose message. Provide 'text' or order data." });
    }

    const result = await sendWhatsAppMessage({ to, text });

    try {
      const businessId = body.business_id || body.businessId;
      const orderId = body.orderId || body.order_id;
      if (businessId) {
        const supabase = supabaseAdmin();
        const logStatus = result.success ? "SENT" : result.dryRun ? "DRY_RUN" : "FAILED";
        await logWhatsAppMessage(supabase, {
          orderId: orderId || null,
          businessId,
          phone: to,
          templateName: body.triggerEvent || body.trigger_event || null,
          messageBody: text,
          metaMessageId: result.messageId || null,
          status: logStatus,
          errorMessage: result.error || null
        });
      }
    } catch (logError: any) {
      console.error("[whatsapp-sender] Failed to log message:", logError.message);
    }

    if (result.dryRun) {
      return json(200, { dryRun: true, to, text, fallbackLink: result.fallbackLink || buildFallbackLink(to, text) });
    }

    if (result.success) {
      return json(200, result.raw);
    }

    return json(502, {
      error: result.error,
      fallbackLink: result.fallbackLink || buildFallbackLink(to, text)
    });
  } catch (error: any) {
    console.error("[whatsapp-sender] Unexpected error:", error.message);
    return json(500, { error: error.message });
  }
}

export const POST = netlifyHandler(handler);