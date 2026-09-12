import {
  buildPaymentMethodLines,
  digitsOnly,
  money,
  normalizeOrder
} from "@/lib/client";
import type { BusinessConfig } from "@/lib/types/domain";

// ─── Shared helpers (ported from app.js) ───────────────────────────────

export function buildTicketUrl(orderNumber: string | number) {
  return `${window.location.origin}/tiquete?number=${orderNumber}`;
}

export const FALLBACK_CONFIG: BusinessConfig = {
  business_id: "",
  business_name: "Majesty Lavanderia",
  business_slug: "majesty",
  business_color: "",
  plan: "free",
  vertical_emoji: "🧺",
  vertical_name: "Lavandería",
  services_config: [
    { name: "Lavado estándar", description: "Lavado con detergente premium", default_price: 12000, duration: 180, unit: "per_kg", active: true },
    { name: "Planchado", description: "Planchado profesional", default_price: 8000, duration: 60, unit: "per_item", active: true },
    { name: "Tintorería", description: "Lavado en seco profesional", default_price: 25000, duration: 240, unit: "per_item", active: true },
    { name: "Lavado en seco", description: "Tratamiento especial para prendas delicadas", default_price: 20000, duration: 180, unit: "per_item", active: true }
  ],
  custom_fields_config: [
    { field_key: "is_delicate", display_label: "Prenda Delicada", field_type: "boolean", required: false, default_value: false },
    { field_key: "rack_location", display_label: "Ubicación / Estante", field_type: "text", required: false, default_value: null }
  ],
  status_flow_config: [
    { status_key: "RECEIVED", display_label: "Recibido" },
    { status_key: "IN_PROGRESS", display_label: "En proceso" },
    { status_key: "READY", display_label: "Listo" },
    { status_key: "DELIVERED", display_label: "Entregado" }
  ],
  whatsapp_templates_config: {},
  currency: "COP",
  payment_config: {}
};

export function getStatusLabels(config: BusinessConfig) {
  const labels: Record<string, string> = {};
  for (const entry of config.status_flow_config || []) labels[entry.status_key] = entry.display_label;
  if (!labels.CANCELLED) labels.CANCELLED = "Cancelado";
  return labels;
}

export function findReadyStatus(config: BusinessConfig) {
  const flow = config.status_flow_config || [];
  const readyEntry = flow.find((e: any) => String(e.status_key).toUpperCase().includes("READY"));
  if (readyEntry) return readyEntry.status_key;
  if (flow.length >= 2) return flow[flow.length - 2].status_key;
  return "READY";
}

export function isDeliveredStatus(status: string, config: BusinessConfig) {
  if (!status) return false;
  if (status.toUpperCase() === "DELIVERED") return true;
  const flow = config.status_flow_config || [];
  if (flow.length > 0) {
    const last = flow[flow.length - 1];
    if (last && last.status_key.toUpperCase() === status.toUpperCase()) return true;
  }
  return false;
}

export function buildWhatsAppMessage(order: any, templateName: string, config: BusinessConfig, slug: string) {
  const o = normalizeOrder(order);
  const template = templateName || order.templateName || "default";
  const name = o.customer_name || "Cliente";
  const businessName = config.business_name || "TiqueteVivo";
  const paymentLines = buildPaymentMethodLines(config.payment_config);
  const address = (o.custom_fields && (o.custom_fields.direccion || o.custom_fields.delivery_address || o.custom_fields.address || o.custom_fields.direccion_entrega)) || "";
  const cleanSlug = slug || config.business_slug || "majesty";
  const url = `${window.location.origin}/tiquete?number=${encodeURIComponent(String(o.order_number))}&slug=${encodeURIComponent(cleanSlug)}`;

  switch (template) {
    case "maktub_recogida":
      return [
        `🐧 *${businessName.toUpperCase()}*`,
        `🚚 *Confirmación de Recogida a Domicilio*`,
        ``,
        `Hola *${name}* 👋`,
        `Estamos programando la recogida de tus prendas.`,
        ``,
        `📍 *Dirección de recogida:*`,
        `${address}`,
        ``,
        `🧺 *Detalle del Servicio:*`,
        `• ${o.items_text}`,
        ``,
        `⏱️ *Tiempo estimado:* 3 horas tras la recogida.`,
        ``,
        `🌱 *Sigue tu pedido en vivo:*`,
        `${url}`,
        ``,
        `¡En breve nuestro domiciliario estará contigo! 🛵✨`
      ].join("\n");
    case "maktub_en_entrega":
      return [
        `🛵 *¡TU PEDIDO VA EN CAMINO!*`,
        `🐧 ${businessName} · Tiquete #${o.order_number}`,
        ``,
        `Hola *${name}* 👋`,
        `Tus prendas ya fueron lavadas, secadas y planchadas con la mejor calidad.`,
        ``,
        `💳 *Saldo a pagar al recibir:*`,
        `*${money.format(o.balance)}* (Aceptamos Nequi, Daviplata o Efectivo)`,
        ``,
        `🌱 *Ver Recibo Digital Completo:*`,
        `${url}`,
        ``,
        `¡Gracias por confiar el cuidado de tus prendas en nosotros! ✨`
      ].join("\n");
    case "maktub_remision_b2b":
      return [
        `🏨 *${businessName.toUpperCase()}*`,
        `📋 *Remisión Comercial B2B #${o.order_number}*`,
        ``,
        `Estimado(a) *${name}* 👋`,
        ``,
        `🧺 *Detalle de Kilos Procesados:*`,
        `• ${o.items_text}`,
        ``,
        `💳 *Resumen de Cuenta:*`,
        `• Total Servicio: ${money.format(o.total)}`,
        `• Saldo Pendiente: *${money.format(o.balance)}*`,
        ``,
        `🌱 *Ver Remisión Digital Completa:*`,
        `${url}`,
        ``,
        `Agradecemos su confianza en nuestro servicio corporativo 🐧`
      ].join("\n");
    case "maktub_cobro":
      return [
        `💸 *RECORDATORIO DE PAGO*`,
        `🐧 ${businessName} · Tiquete #${o.order_number}`,
        ``,
        `Hola *${name}* 👋`,
        `Esperamos que te encuentres muy bien.`,
        ``,
        `💳 *Saldo Pendiente de tu Servicio:*`,
        `*${money.format(o.balance)}*`,
        ``,
        `🏦 *Medios de Pago Disponibles:*`,
        ...paymentLines,
        ``,
        `🌱 *Ver Tiquete Digital:*`,
        `${url}`,
        ``,
        `Envíanos el comprobante por este chat. ¡Muchas gracias! 🐧✨`
      ].join("\n");
    default:
      return [
        `🐧 *${businessName.toUpperCase()}*`,
        `📄 *Recibo Digital #${o.order_number}*`,
        ``,
        `Hola *${name}* 👋`,
        `¡Gracias por confiar en nosotros!`,
        ``,
        `🧺 *Detalle del Servicio:*`,
        `• ${o.items_text}`,
        ``,
        `💳 *Resumen del Pedido:*`,
        `• Total Servicio: ${money.format(o.total)}`,
        `• Abono Realizado: ${money.format(o.paid)}`,
        `• Saldo Pendiente: *${money.format(o.balance)}*`,
        ``,
        `🌱 *Consulta tu Tiquete Digital 100% Cero Papel:*`,
        `${url}`,
        ``,
        `¡Nos aseguraremos de dejar todo impecable! ✨`
      ].join("\n");
  }
}

export function buildWaLink(order: any, templateName: string, config: BusinessConfig, slug: string) {
  return `https://wa.me/${digitsOnly(order.customer_phone)}?text=${encodeURIComponent(buildWhatsAppMessage(order, templateName, config, slug))}`;
}

export function formatCustomFieldDisplay(value: any, def: any) {
  if (value == null || value === "" || value === false) return "";
  if (def && def.field_type === "boolean") return value ? "Sí" : "No";
  if (def && def.field_type === "datetime" && value) {
    try { return new Date(value).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }); } catch { return value; }
  }
  if (def && def.field_type === "date" && value) {
    try { return new Date(value).toLocaleDateString("es-CO"); } catch { return value; }
  }
  if (def && def.field_type === "textarea" && value) return String(value).replace(/\r?\n/g, " · ");
  return value;
}

export function buildConfirmationDisplay(order: any) {
  const html: string[] = [];
  if (order.intake_confirmed_at) {
    try {
      const d = new Date(order.intake_confirmed_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      html.push(`<small class="mt-1 block text-[11px] font-extrabold text-success-700">✅ Recibido conforme: ${d}</small>`);
    } catch { /* ignore */ }
  }
  if (order.delivery_confirmed_at) {
    try {
      const d = new Date(order.delivery_confirmed_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      html.push(`<small class="mt-1 block text-[11px] font-extrabold text-info-700">✅ Entregado conforme: ${d}</small>`);
    } catch { /* ignore */ }
  }
  return html.join("");
}
