/**
 * Template Engine module for vertical-aware WhatsApp message rendering.
 * Pure function module — no I/O, fully testable in isolation.
 */

const GENERIC_FALLBACK_TEMPLATE =
  "📋 *{business_name}*\n\nOrden #{order_number}\nEstado: {status_label}";

const CUSTOMER_REACTIVATION_TEMPLATE =
  "👋 ¡Hola {customer_name}!\n\n" +
  "Te extrañamos en *{business_name}*. " +
  "Han pasado {days_inactive} días desde tu último servicio de *{last_service}*.\n\n" +
  "🎁 Tenemos un descuento especial para ti:\n{coupon_link}\n\n" +
  "¡Te esperamos pronto! 💪";

const PAYMENT_CONFIRMED_TEMPLATE =
  "✅ *{business_name}*\n\n" +
  "¡Pago confirmado!\n" +
  "Orden #{order_number}\n" +
  "Monto pagado: ${amount_paid}\n" +
  "Saldo pendiente: ${new_balance}\n\n" +
  "¡Gracias por tu pago! 🙏";

const APPROVAL_REQUESTED_TEMPLATE =
  "🧾 *{business_name}*\n\n" +
  "Hola {customer_name}, tenemos una cotización para tu orden #{order_number}:\n\n" +
  "{approval_description}\n" +
  "Valor: ${approval_amount}\n\n" +
  "Aprueba o rechaza desde aquí:\n{approval_link}";

const APPROVAL_DECIDED_TEMPLATE =
  "✅ *{business_name}*\n\n" +
  "Recibimos tu decisión sobre la orden #{order_number}: *{approval_decision}*.\n\n" +
  "¡Gracias!";

const BUILTIN_TEMPLATES: Record<string, string> = {
  customer_reactivation: CUSTOMER_REACTIVATION_TEMPLATE,
  payment_confirmed: PAYMENT_CONFIRMED_TEMPLATE,
  approval_requested: APPROVAL_REQUESTED_TEMPLATE,
  approval_decided: APPROVAL_DECIDED_TEMPLATE
};

export function selectTemplate(
  triggerEvent: string,
  businessTemplates: any,
  verticalTemplates: any
): string {
  if (businessTemplates && typeof businessTemplates === "object" && businessTemplates[triggerEvent]) {
    return businessTemplates[triggerEvent];
  }

  if (verticalTemplates && typeof verticalTemplates === "object" && verticalTemplates[triggerEvent]) {
    return verticalTemplates[triggerEvent];
  }

  if (BUILTIN_TEMPLATES[triggerEvent]) {
    return BUILTIN_TEMPLATES[triggerEvent];
  }

  return GENERIC_FALLBACK_TEMPLATE;
}

export function renderTemplate(template: string, orderData: any, businessData: any): string {
  if (!template || typeof template !== "string") {
    return "";
  }

  const order = orderData || {};
  const business = businessData || {};

  const dataMap: Record<string, any> = {
    customer_name: order.customer_name ?? order.customerName ?? "",
    order_number: order.order_number ?? order.orderNumber ?? "",
    business_name: business.name ?? business.business_name ?? "",
    items_text: order.items_text ?? order.itemsText ?? "",
    total: order.total != null ? String(order.total) : "",
    balance: order.balance != null ? String(order.balance) : "",
    status_label: order.status_label ?? order.statusLabel ?? "",
    last_service: order.last_service ?? order.lastService ?? "",
    days_inactive: order.days_inactive != null ? String(order.days_inactive) : "",
    coupon_link: order.coupon_link ?? order.couponLink ?? "",
    amount_paid: order.amount_paid != null ? String(order.amount_paid) : "",
    new_balance: order.new_balance != null ? String(order.new_balance) : "",
    approval_amount: order.approval_amount != null ? String(order.approval_amount) : "",
    approval_description: order.approval_description ?? order.approvalDescription ?? "",
    approval_link: order.approval_link ?? order.approvalLink ?? "",
    approval_decision: order.approval_decision ?? order.approvalDecision ?? ""
  };

  const rendered = template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const trimmedKey = key.trim();

    if (trimmedKey.startsWith("custom.")) {
      const customKey = trimmedKey.slice("custom.".length);
      const customFields = order.custom_fields || order.customFields || {};
      const value = customFields[customKey];
      return value != null ? String(value) : "";
    }

    if (trimmedKey in dataMap) {
      return dataMap[trimmedKey] != null ? String(dataMap[trimmedKey]) : "";
    }

    return "";
  });

  return rendered;
}