/**
 * Shared WhatsApp module — provides reusable functions for sending WhatsApp
 * messages via Meta Cloud API, building fallback links, and logging attempts.
 */

import { selectTemplate, renderTemplate } from "./_template-engine";

export function buildOrderMessageFromTemplate(params: any = {}): string {
  const {
    triggerEvent = "order_created",
    businessTemplates = null,
    verticalTemplates = null,
    orderData = {},
    businessData = {}
  } = params;
  const template = selectTemplate(triggerEvent, businessTemplates, verticalTemplates);
  return renderTemplate(template, orderData, businessData);
}

/** @deprecated Use `buildOrderMessageFromTemplate` instead. */
export function buildOrderMessage(order: any): string {
  const businessTemplates = order._businessTemplates || null;
  const verticalTemplates = order._verticalTemplates || null;
  const triggerEvent = order._triggerEvent || "order_created";

  const orderData = {
    customer_name: order.customer_name || order.customerName || "",
    order_number: order.order_number || order.orderNumber || "",
    items_text: order.items_text || order.itemsText || "",
    total: order.total != null ? Number(order.total) : 0,
    balance: Number(order.balance ?? Math.max(0, Number(order.total || 0) - Number(order.paid || 0))),
    status_label: order.status_label || order.statusLabel || order.status || "",
    custom_fields: order.custom_fields || order.customFields || {}
  };

  const businessData = {
    name: order.business_name || order.businessName || ""
  };

  return buildOrderMessageFromTemplate({
    triggerEvent,
    businessTemplates,
    verticalTemplates,
    orderData,
    businessData
  });
}

export async function sendWhatsAppMessage(params: any): Promise<any> {
  const { to, text, templateName, templateParams } = params;
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    const fallbackLink = buildFallbackLink(to, text || "");
    return {
      success: false,
      dryRun: true,
      to,
      text: text || null,
      templateName: templateName || null,
      fallbackLink
    };
  }

  let payload: any;

  if (templateName) {
    const components: any[] = [];
    if (templateParams && templateParams.length > 0) {
      components.push({
        type: "body",
        parameters: templateParams.map((value: any) => ({
          type: "text",
          text: String(value)
        }))
      });
    }

    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        components: components.length > 0 ? components : undefined
      }
    };
  } else {
    if (!text) {
      return {
        success: false,
        error: "Either text or templateName must be provided",
        fallbackLink: buildFallbackLink(to, "")
      };
    }

    payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: text }
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (response.ok) {
      const messageId = result.messages?.[0]?.id || null;
      return { success: true, messageId, raw: result };
    }

    const errorMsg = result.error?.message || JSON.stringify(result);
    return {
      success: false,
      error: errorMsg,
      fallbackLink: buildFallbackLink(to, text || "")
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      fallbackLink: buildFallbackLink(to, text || "")
    };
  }
}

export function buildFallbackLink(phone: string, text: string): string {
  const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
  const encodedText = encodeURIComponent(text || "");
  return `https://wa.me/${cleanPhone}?text=${encodedText}`;
}

export async function logWhatsAppMessage(
  supabase: any,
  params: any
): Promise<{ data: any; error: any }> {
  const {
    orderId,
    businessId,
    phone,
    templateName,
    messageBody,
    metaMessageId,
    status,
    errorMessage
  } = params;

  const record = {
    order_id: orderId || null,
    business_id: businessId || null,
    phone: phone,
    template_name: templateName || null,
    message_body: messageBody || null,
    meta_message_id: metaMessageId || null,
    status: status,
    error_message: errorMessage || null
  };

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error("[logWhatsAppMessage] Failed to insert log:", error.message);
  }

  return { data, error };
}