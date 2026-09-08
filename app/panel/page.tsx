"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import Button from "@/components/ui/Button";
import StatusTag from "@/components/ui/StatusTag";
import { useBrandTheme } from "@/lib/brand-theme";
import { isFruverVertical } from "@/lib/fruver/vertical";
import FruverPanel from "./fruver/FruverPanel";
import {
  apiFetch,
  apiGetJSON,
  apiPostJSON,
  buildPaymentMethodLines,
  compressImage,
  digitsOnly,
  getStoredToken,
  money,
  normalizeOrder
} from "@/lib/client";

// ─── Shared helpers (ported from app.js) ───────────────────────────────

function buildTicketUrl(orderNumber: string | number) {
  return `${window.location.origin}/tiquete?number=${orderNumber}`;
}

interface BusinessConfig {
  business_id: string;
  business_name: string;
  business_slug: string;
  business_color: string;
  plan: string;
  vertical_emoji: string;
  vertical_name: string;
  services_config: any[];
  custom_fields_config: any[];
  status_flow_config: any[];
  whatsapp_templates_config: Record<string, any>;
  currency: string;
  payment_config: any;
}

const FALLBACK_CONFIG: BusinessConfig = {
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

function getStatusLabels(config: BusinessConfig) {
  const labels: Record<string, string> = {};
  for (const entry of config.status_flow_config || []) labels[entry.status_key] = entry.display_label;
  if (!labels.CANCELLED) labels.CANCELLED = "Cancelado";
  return labels;
}

function findReadyStatus(config: BusinessConfig) {
  const flow = config.status_flow_config || [];
  const readyEntry = flow.find((e: any) => String(e.status_key).toUpperCase().includes("READY"));
  if (readyEntry) return readyEntry.status_key;
  if (flow.length >= 2) return flow[flow.length - 2].status_key;
  return "READY";
}

function isDeliveredStatus(status: string, config: BusinessConfig) {
  if (!status) return false;
  if (status.toUpperCase() === "DELIVERED") return true;
  const flow = config.status_flow_config || [];
  if (flow.length > 0) {
    const last = flow[flow.length - 1];
    if (last && last.status_key.toUpperCase() === status.toUpperCase()) return true;
  }
  return false;
}

function buildWhatsAppMessage(order: any, templateName: string, config: BusinessConfig, slug: string) {
  const o = normalizeOrder(order);
  const template = templateName || order.templateName || "default";
  const ticketUrl = buildTicketUrl(o.order_number);
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

function buildWaLink(order: any, templateName: string, config: BusinessConfig, slug: string) {
  return `https://wa.me/${digitsOnly(order.customer_phone)}?text=${encodeURIComponent(buildWhatsAppMessage(order, templateName, config, slug))}`;
}

function formatCustomFieldDisplay(value: any, def: any) {
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

function buildConfirmationDisplay(order: any) {
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

// ─── Login overlay ─────────────────────────────────────────────────────

function LoginOverlay({ onLogin, error }: { onLogin: (e: React.FormEvent) => void; error: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-5">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <h2 className="text-xl font-extrabold text-slate-900">🔐 Acceso al panel</h2>
        <p className="mt-1 text-sm text-slate-600">Ingresa tus credenciales de operador para continuar.</p>
        <form onSubmit={onLogin} className="mt-4">
          <label className="block text-sm font-bold text-slate-700">
            Correo electrónico
            <input id="loginEmail" type="email" required placeholder="operador@negocio.com"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2" />
          </label>
          <label className="mt-3 block text-sm font-bold text-slate-700">
            Contraseña
            <input id="loginPassword" type="password" required placeholder="••••••••"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2" />
          </label>
          {error && <p className="mt-2 text-sm font-bold text-error-700">{error}</p>}
          <button type="submit" className="mt-4 w-full rounded-md bg-brand-600 py-3 font-extrabold text-white hover:bg-brand-700">
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── QR Modal ─────────────────────────────────────────────────────────

function QrModal({ order, config, slug, onClose }: { order: any; config: BusinessConfig; slug: string; onClose: () => void }) {
  const url = order
    ? `${window.location.origin}/tiquete?number=${encodeURIComponent(String(order.order_number))}&slug=${encodeURIComponent(slug)}`
    : "";
  const wa = order ? buildWaLink(order, "default", config, slug) : "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm rounded-2xl bg-white p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <strong className="text-lg text-slate-900">Tiquete Digital #{order?.order_number}</strong>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <p className="mt-1 text-sm text-slate-600">Cliente: <strong className="text-slate-900">{order?.customer_name}</strong></p>
        <div className="mt-3 flex justify-center rounded-xl bg-slate-50 p-4">
          <QRCodeSVG value={url} size={200} fgColor="#101828" bgColor="#ffffff" level="M" />
        </div>
        <p className="mt-2 text-center text-xs font-extrabold text-success-700">📸 Apunta la cámara → Ver tu recibo digital</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white">
            🌐 Ver Tiquete
          </a>
          <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-success-600 px-3 py-2 text-sm font-bold text-white">
            📱 WhatsApp
          </a>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Photo Modal ─────────────────────────────────────────────

function DeliveryPhotoModal({ onConfirm, onSkip }: { onConfirm: (photo: string | null) => void; onSkip: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-sm rounded-2xl bg-white p-6 shadow-card">
        <strong className="text-lg text-slate-900">📸 Foto de entrega</strong>
        <p className="mt-1 text-sm text-slate-600">Opcional: adjunta una foto del pedido entregado. Puedes omitir este paso.</p>
        {photo ? (
          <div className="relative mt-3">
            <img src={photo} alt="Vista previa entrega" className="max-h-64 w-full rounded-lg object-cover" />
            <button className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-900/70 text-white" onClick={() => setPhoto(null)}>✕</button>
          </div>
        ) : (
          <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
            📷 Tomar foto / Elegir imagen
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setPhoto(await compressImage(file, 800, 0.8));
                } catch { /* ignore */ }
                e.target.value = "";
              }}
            />
          </label>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={onSkip} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-600">
            Omitir
          </button>
          <button onClick={() => onConfirm(photo)} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 font-bold text-white">
            Confirmar entrega
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Link Modal ──────────────────────────────────────────────

function DeliveryLinkModal({ order, businessId, onClose, toastFn }: { order: any; businessId: string; onClose: () => void; toastFn: (m: string) => void }) {
  const [phone, setPhone] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const cf = order?.custom_fields || {};
  const address = cf.direccion || cf.delivery_address || cf.address || cf.direccion_entrega || "No disponible";
  const balance = Number(order?.balance ?? Math.max(0, Number(order?.total || 0) - Number(order?.paid || 0)));

  async function generate() {
    if (!order || !businessId) {
      toastFn("Error: datos insuficientes");
      return;
    }
    setBusy(true);
    const result = await apiPostJSON("/api/delivery-confirm", {
      action: "generate-token",
      order_id: order.id,
      business_id: businessId
    });
    setBusy(false);
    if (!result.ok || !result.data?.delivery_url) {
      toastFn(result.data?.message || result.data?.error || "Error al generar link");
      return;
    }
    setDeliveryUrl(result.data.delivery_url);
    toastFn("Link de entrega generado");
  }

  async function sendWhatsApp() {
    const p = digitsOnly(phone);
    if (p.length < 7) {
      toastFn("Ingresa el teléfono del domiciliario");
      return;
    }
    const message = [
      `🚚 *Entrega Pendiente*`,
      ``,
      `👤 *Cliente:* ${order.customer_name}`,
      `📍 *Dirección:* ${address}`,
      `💰 *Cobrar:* ${money.format(balance)}`,
      ``,
      `🔗 *Link de confirmación:*`,
      deliveryUrl,
      ``,
      `⏰ Este link expira en 2 horas.`
    ].join("\n");
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-card text-left">
        <div className="flex items-start justify-between">
          <strong className="text-lg text-slate-900">🚚 Generar Link de Entrega</strong>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          <div><strong>Cliente:</strong> {order?.customer_name}</div>
          <div><strong>Dirección:</strong> {address}</div>
          <div><strong>Saldo a cobrar:</strong> <span className="font-extrabold">{money.format(balance)}</span></div>
        </div>
        <label className="mt-3 block text-xs font-bold text-slate-700">
          Teléfono del domiciliario
          <input type="tel" value={phone} placeholder="+57 300 123 4567"
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5" />
        </label>
        <button onClick={generate} disabled={busy}
          className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2.5 font-extrabold text-white hover:bg-brand-700 disabled:opacity-60">
          {busy ? "Generando…" : "🔗 Generar Link"}
        </button>
        {deliveryUrl && (
          <div className="mt-3 rounded-xl border border-success-200 bg-success-50 p-3">
            <div className="text-[11px] font-bold text-success-900">Link generado (expira en 2 horas):</div>
            <div className="mt-1 break-all rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800">
              {deliveryUrl}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => navigator.clipboard?.writeText(deliveryUrl).then(() => toastFn("Link copiado"))}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold">
                📋 Copiar
              </button>
              <button onClick={sendWhatsApp} disabled={digitsOnly(phone).length < 7}
                className="flex-1 rounded-lg bg-success-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
                📱 Enviar por WhatsApp
              </button>
            </div>
          </div>
        )}
        <button onClick={onClose} className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-2 font-bold text-slate-600">
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Scanner Modal ────────────────────────────────────────────────────

function ScannerModal({ onDetect, onClose }: { onDetect: (payload: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState(true);
  const [manual, setManual] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const det: any = (typeof window !== "undefined" && (window as any).BarcodeDetector) ? new (window as any).BarcodeDetector({ formats: ["qr_code"] }) : null;
    detectorRef.current = det;
    if (!det) {
      setSupported(false);
      return;
    }
    let active = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        runningRef.current = true;
        tick();
      })
      .catch(() => setSupported(false));
    return () => {
      active = false;
      runningRef.current = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tick() {
    if (!runningRef.current || !detectorRef.current || !videoRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0 && codes[0].rawValue) {
        runningRef.current = false;
        onDetect(codes[0].rawValue);
        return;
      }
    } catch { /* ignore */ }
    window.setTimeout(tick, 250);
  }

  function submitManual() {
    const v = manual.trim();
    if (v) onDetect(v);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 lg:items-center lg:p-4">
      <div className="card max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl lg:max-w-md lg:rounded-2xl">
        <div className="flex items-center justify-between">
          <strong className="text-lg text-slate-900">📸 Escanear QR de Entrega</strong>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>
        {supported ? (
          <div className="mt-3 overflow-hidden rounded-xl bg-slate-900">
            <video ref={videoRef} muted playsInline className="h-64 w-full object-cover" />
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-center">
            <p className="font-extrabold text-warning-800">⚠️ Cámara no disponible</p>
            <p className="mt-1 text-sm text-warning-900">
              Escribe el número de tiquete o pega el contenido del QR en el campo de abajo.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs font-bold text-slate-600">¿El QR no se detecta? Escríbelo aquí:</p>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="#8707 o URL del tiquete"
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        <button onClick={submitManual} className="mt-2 w-full rounded-lg bg-slate-900 px-4 py-2 font-bold text-white">
          Buscar
        </button>
      </div>
    </div>
  );
}

// ─── Coupon Panel ─────────────────────────────────────────────────────

function CouponPanel({ orders, toastFn, onRedeemed }: { orders: any[]; toastFn: (m: string) => void; onRedeemed: () => void }) {
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<any>(null);
  const [result, setResult] = useState<{ type: string; html: string } | null>(null);
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);

  async function validate() {
    const c = code.trim().toUpperCase();
    if (!c) { setResult({ type: "error", html: "Ingresa un código de cupón." }); return; }
    setBusy(true);
    const res = await apiGetJSON(`/api/validate-coupon?code=${encodeURIComponent(c)}`);
    setBusy(false);
    if (res.ok && res.data.valid && res.data.coupon) {
      setCoupon(res.data.coupon);
      const typeLabel: Record<string, string> = {
        PERCENT: res.data.coupon.value + "% descuento",
        AMOUNT: money.format(res.data.coupon.value) + " descuento",
        FREE_DELIVERY: "Domicilio gratis"
      };
      const label = typeLabel[res.data.coupon.type] || res.data.coupon.type;
      const expires = new Date(res.data.coupon.expires_at).toLocaleDateString("es-CO");
      setResult({ type: "success", html: `✅ Cupón válido: <strong>${res.data.coupon.code}</strong> — ${label}<div class="mt-1 text-xs">Vence: ${expires}</div>` });
    } else {
      setCoupon(null);
      const msgs: Record<string, string> = {
        "Coupon not found": "❌ Cupón no encontrado",
        "Coupon already redeemed": "❌ Cupón ya fue canjeado",
        "Coupon expired": "❌ Cupón expirado"
      };
      setResult({ type: "error", html: msgs[res.data?.error] || "❌ " + (res.data?.error || "Cupón no válido") });
    }
  }

  async function redeem() {
    if (!coupon) { setResult({ type: "error", html: "Valida un cupón primero." }); return; }
    if (!orderId) { setResult({ type: "error", html: "Selecciona un pedido para aplicar el cupón." }); return; }
    setBusy(true);
    const res = await apiPostJSON("/api/redeem-coupon", { code: coupon.code, order_id: orderId });
    setBusy(false);
    if (res.ok && res.data.redeemed) {
      setResult({ type: "success", html: "🎉 ¡Cupón canjeado exitosamente! Descuento aplicado al pedido." });
      setCode("");
      setCoupon(null);
      setOrderId("");
      toastFn("Cupón canjeado ✅");
      onRedeemed();
    } else {
      setResult({ type: "error", html: "❌ " + (res.data?.error || "No se pudo canjear el cupón") });
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <strong className="block mb-2 font-extrabold">🎫 Canjear Cupón</strong>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => { setCode(e.target.value); setResult(null); }} maxLength={12} placeholder="Código del cupón (ej: ABC123)"
          onKeyDown={(e) => e.key === "Enter" && validate()} className="flex-1 rounded-lg border border-slate-200 px-3 py-2" />
        <button onClick={validate} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-slate-700">
          Validar
        </button>
      </div>
      {result && (
        <div className={`mt-2 rounded-lg px-3 py-2 text-sm font-bold ${result.type === "success" ? "bg-success-50 text-success-800" : "bg-error-50 text-error-700"}`}>
          <span dangerouslySetInnerHTML={{ __html: result.html }} />
        </div>
      )}
      {coupon && (
        <div className="mt-2 flex gap-2">
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-2 py-2 text-sm">
            <option value="">Seleccionar pedido...</option>
            {orders.filter((o) => o.status !== "CANCELLED").map((o) => (
              <option key={o.id} value={o.id}>#{o.order_number} — {o.customer_name || "Sin nombre"}</option>
            ))}
          </select>
          <button onClick={redeem} disabled={busy} className="rounded-lg bg-brand-600 px-3 py-2 font-bold text-white">
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Order Form ───────────────────────────────────────────────────────

interface FormState {
  serviceType: string;
  templateName: string;
  customerName: string;
  customerPhone: string;
  itemsText: string;
  total: string;
  paid: string;
  status: string;
  dueDate: string;
  intakeConfirmed: boolean;
  intakePhoto: string | null;
  customFields: Record<string, any>;
}

const EMPTY_FORM: FormState = {
  serviceType: "",
  templateName: "default",
  customerName: "",
  customerPhone: "",
  itemsText: "",
  total: "",
  paid: "",
  status: "",
  dueDate: "",
  intakeConfirmed: false,
  intakePhoto: null,
  customFields: {}
};

function ServiceDetailFields({ unit, defaultPrice, total, itemsText, setTotal, setItemsText }: {
  unit: string; defaultPrice: number; total: string; itemsText: string;
  setTotal: (v: string) => void; setItemsText: (v: string) => void;
}) {
  const [qty, setQty] = useState(unit === "per_kg" ? "10" : "1");
  const [unitPrice, setUnitPrice] = useState(String(defaultPrice || (unit === "per_kg" ? 4500 : unit === "per_item" ? 8000 : 12000)));
  const serviceNameRef = useRef<string>("");

  useEffect(() => {
    setUnitPrice(String(defaultPrice || 0));
    if (unit !== "per_kg" && unit !== "per_item" && unit !== "per_hour") return;
    recalc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, defaultPrice]);

  function recalc(guessName?: string) {
    const q = parseFloat(qty) || 0;
    const p = parseFloat(unitPrice) || 0;
    setTotal(String(Math.round(q * p)));
    if (unit === "per_kg") setItemsText(`${guessName || "Servicio"}: ${q} kg a ${money.format(p)}/kg`);
    else if (unit === "per_item") setItemsText(`${guessName || "Servicio"}: ${q} prenda(s) a ${money.format(p)}/und`);
    else if (unit === "per_hour") setItemsText(`${guessName || "Servicio"}: ${q} hr(s) a ${money.format(p)}/hr`);
  }

  if (!unit || unit === "flat_rate") return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-success-200 bg-success-50 p-3">
      <label className="block text-xs font-bold text-slate-700">
        {unit === "per_kg" ? "Kilos (Kg)" : unit === "per_item" ? "Cantidad de prendas" : "Horas"}
        <input type="number" step={unit === "per_kg" ? 0.1 : unit === "per_hour" ? 0.5 : 1} min={0} value={qty}
          onChange={(e) => { setQty(e.target.value); recalc(); }} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5" />
      </label>
      <label className="block text-xs font-bold text-slate-700">
        {unit === "per_kg" ? "Tarifa / Kg" : unit === "per_item" ? "Precio por prenda" : "Tarifa / Hora"}
        <input type="number" min={0} value={unitPrice}
          onChange={(e) => { setUnitPrice(e.target.value); recalc(); }} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5" />
      </label>
    </div>
  );
}

function OrderForm({ config, slug, onCreated, toastFn }: {
  config: BusinessConfig; slug: string; onCreated: (order: any, waLink: string, liveUrl: string, message: string) => void; toastFn: (m: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const paid = config.plan === "paid";
  const services = (config.services_config || []).filter((s: any) => s.active !== false);
  const stateLabels = getStatusLabels(config);
  const statusKeys = [...(config.status_flow_config || []).map((s: any) => s.status_key)];
  // Detecta el vertical para adaptar plantillas y textos del formulario, en
  // lugar de mostrar los valores de lavandería (Maktub) por defecto.
  const isFruver = isFruverVertical({ verticalName: config.vertical_name, businessSlug: config.business_slug });
  const detailPlaceholder = isFruver ? "Ej: 2 kg tomate, 1 lechuga, 3 bananos" : "Ej: 1 sábana, 2 camisas";

  const selectedService = services.find((s: any) => s.name === form.serviceType);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      itemsText: form.itemsText.trim(),
      total: Number(form.total) || 0,
      paid: Number(form.paid) || 0,
      status: form.status || statusKeys[0] || "RECEIVED",
      slug,
      orderNumber: String(Date.now()).slice(-6),
      templateName: form.templateName,
      custom_fields: { ...form.customFields }
    };
    if (selectedService) payload.custom_fields.service_type = selectedService.name;
    if (form.dueDate) payload.dueDate = form.dueDate;
    if (form.intakeConfirmed) payload.intakeConfirmed = true;
    if (form.intakePhoto) payload.intakePhoto = form.intakePhoto;

    let order: any;
    try {
      const res = await apiPostJSON("/api/create-order", payload);
      if (!res.ok) throw new Error(res.data?.message || "No se pudo guardar");
      order = res.data;
      toastFn("Tiquete guardado en la nube");
    } catch (err: any) {
      order = { ...payload, id: "demo-" + Date.now(), order_number: payload.orderNumber, balance: Math.max(0, payload.total - payload.paid), status: payload.status };
      toastFn(err.message || "Pedido guardado localmente.");
    }
    const normalized = normalizeOrder(order);
    const waLink = buildWaLink(normalized, form.templateName, config, slug);
    const liveUrl = `${window.location.origin}/tiquete?number=${encodeURIComponent(normalized.order_number)}&slug=${encodeURIComponent(slug)}`;
    const message = buildWhatsAppMessage(normalized, form.templateName, config, slug);
    onCreated(normalized, waLink, liveUrl, message);

    setForm(EMPTY_FORM);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* El selector de servicios solo aplica a verticales con servicios
          configurados (p. ej. lavandería). En fruver el detalle es libre y los
          productos se manejan por cotización, así que se oculta si no hay. */}
      {services.length > 0 && (
        <label className="block text-sm font-bold text-slate-700">
          Tipo de Servicio
          <select className="input" value={form.serviceType}
            onChange={(e) => {
              const name = e.target.value;
              if (name === "") { set("serviceType", ""); return; }
              const svc = services.find((s: any) => s.name === name);
              set("serviceType", name);
              if (svc && svc.default_price) set("total", String(svc.default_price));
            }}>
            <option value="">Selecciona...</option>
            {services.map((s: any) => (
              <option key={s.name} value={s.name}>
                {s.name}{s.default_price ? ` - ${money.format(s.default_price)}${s.unit === "per_kg" ? "/kg" : s.unit === "per_item" ? "/und" : s.unit === "per_hour" ? "/hr" : ""}` : ""}
              </option>
            ))}
          </select>
          {selectedService?.description && (
            <small className="block text-[11px] font-semibold text-slate-500">ℹ️ {selectedService.description}</small>
          )}
        </label>
      )}

      <label className="block text-sm font-bold text-slate-700">
        Plantilla WhatsApp
        <select className="input" value={form.templateName} onChange={(e) => set("templateName", e.target.value)}>
          {isFruver ? (
            <>
              <option value="default">🥬 Recibo del Pedido + Tiquete Digital</option>
              <option value="maktub_en_entrega">🛵 En Camino a Domicilio</option>
              <option value="maktub_cobro">💸 Recordatorio de Cobro</option>
            </>
          ) : (
            <>
              <option value="default">🐧 Recibo Estándar + Tiquete Digital</option>
              <option value="maktub_recogida">🚚 Recogida a Domicilio</option>
              <option value="maktub_en_entrega">🛵 En Camino a Domicilio</option>
              <option value="maktub_remision_b2b">🏨 Remisión B2B (Por Kilos)</option>
              <option value="maktub_cobro">💸 Recordatorio de Cobro</option>
            </>
          )}
        </select>
      </label>

      <label className="block text-sm font-bold text-slate-700">
        Cliente
        <input className="input" value={form.customerName} required placeholder="Nombre del cliente" onChange={(e) => set("customerName", e.target.value)} />
      </label>
      <label className="block text-sm font-bold text-slate-700">
        WhatsApp
        <input className="input" value={form.customerPhone} required type="tel" placeholder="+57 310 268 8991" onChange={(e) => set("customerPhone", e.target.value.replace(/[^\d+]/g, ""))} />
      </label>

      {selectedService && (
        <div key={selectedService.name}>
          <ServiceDetailFields
            unit={selectedService.unit}
            defaultPrice={Number(selectedService.default_price) || 0}
            total={form.total}
            itemsText={form.itemsText}
            setTotal={(v) => set("total", v)}
            setItemsText={(v) => set("itemsText", v)}
          />
        </div>
      )}

      <label className="block text-sm font-bold text-slate-700">
        Detalle
        <textarea className="input" rows={2} required value={form.itemsText} placeholder={detailPlaceholder} onChange={(e) => set("itemsText", e.target.value)} />
      </label>

      {paid && (
        <label className="block text-sm font-bold text-slate-700">
          Evidencia fotográfica al recibir
          {form.intakePhoto ? (
            <span className="relative mt-1 block">
              <img src={form.intakePhoto} alt="Vista previa" className="max-h-40 w-full rounded-lg object-cover" />
              <button type="button" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-900/70 text-white" onClick={() => set("intakePhoto", null)}>✕</button>
            </span>
          ) : (
            <label className="mt-1 block cursor-pointer rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
              📸 Tomar foto / Elegir imagen
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) set("intakePhoto", await compressImage(file, 800, 0.8));
                  e.target.value = "";
                }} />
            </label>
          )}
          <small className="block text-[11px] text-slate-500">La imagen se comprime a ~800 px.</small>
        </label>
      )}
      {!paid && (
        <small className="block text-xs font-bold text-warning-700">⭐ Actualiza al plan pago para activar evidencia fotográfica y confirmaciones digitales.</small>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
        <input type="checkbox" checked={form.intakeConfirmed} disabled={!paid}
          onChange={(e) => set("intakeConfirmed", e.target.checked)} className="h-4 w-4 accent-brand-600" />
        ✅ Cliente confirma recepción conforme
      </label>

      {(config.custom_fields_config || []).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {(config.custom_fields_config || []).map((def: any) => {
            const val = form.customFields[def.field_key];
            return def.field_type === "boolean" ? (
              <label key={def.field_key} className="col-span-2 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={Boolean(val)} onChange={(e) => set("customFields", { ...form.customFields, [def.field_key]: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                {def.display_label}
              </label>
            ) : (
              <label key={def.field_key} className="block text-sm font-bold text-slate-700">
                {def.display_label}
                {def.field_type === "select" ? (
                  <select className="input" value={val || ""} onChange={(e) => set("customFields", { ...form.customFields, [def.field_key]: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {(def.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : def.field_type === "datetime" ? "datetime-local" : def.field_type === "time" ? "time" : "text"}
                    value={val ?? ""}
                    onChange={(e) => set("customFields", { ...form.customFields, [def.field_key]: e.target.value })}
                  />
                )}
              </label>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-extrabold text-slate-800">
          Total a pagar
          <input className="input text-lg font-extrabold" type="number" min={0} required value={form.total} onChange={(e) => set("total", e.target.value)} />
        </label>
        <label className="block text-sm font-bold text-slate-700">
          Abono
          <input className="input" type="number" min={0} required value={form.paid} onChange={(e) => set("paid", e.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-bold text-slate-700">
          Estado
          <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {statusKeys.map((k) => <option key={k} value={k}>{stateLabels[k] || k}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-700">
          Entrega
          <input className="input" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </label>
      </div>

      <Button type="submit" variant="primary" rounded="lg" className="mt-1 w-full px-4 py-3">
        ✅ Crear Tiquete y Abrir WhatsApp
      </Button>
    </form>
  );
}

// ─── Receipt ──────────────────────────────────────────────────────────

function Receipt({ order, waLink, liveUrl, message }: { order: any; waLink: string; liveUrl: string; message: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-xl border border-success-200 bg-white p-4 text-center shadow-card">
      <strong className="block text-slate-900">Tiquete Digital #{order?.order_number} Creado 🌱</strong>
      <p className="mt-1 text-sm text-slate-600">El cliente escanea este QR para ver su recibo digital en tiempo real 📸</p>
      <div className="mt-3 inline-block rounded-xl border border-success-200 bg-white p-3">
        <QRCodeSVG value={liveUrl} size={150} fgColor="#101828" bgColor="#ffffff" level="M" />
        <div className="mt-1 text-center text-[11px] font-extrabold text-success-700">📸 Ver Recibo Digital</div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-success-600 px-3 py-2 text-sm font-bold text-white">📱 Abrir WhatsApp</a>
        <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">🌐 Ver Tiquete</a>
        <button onClick={() => navigator.clipboard?.writeText(message).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
          {copied ? "✓ Copiado" : "📋 Copiar"}
        </button>
      </div>
    </div>
  );
}

// ─── Orders Table ─────────────────────────────────────────────────────

function OrdersTable({ orders, loyalty, config, slug, onOpenQr, onChangeStatus, onOpenDeliveryLink, onRequestApproval, onOpenScanner }: {
  orders: any[]; loyalty: Record<string, any>; config: BusinessConfig; slug: string;
  onOpenQr: (o: any) => void; onChangeStatus: (o: any, s: string) => void;
  onOpenDeliveryLink: (o: any) => void; onRequestApproval: (o: any) => void; onOpenScanner: () => void;
}) {
  const statusLabels = getStatusLabels(config);
  const statusOptions = (orderStatus: string) => {
    const base = (config.status_flow_config || []).map((e: any) =>
      `<option value="${e.status_key}"${orderStatus === e.status_key ? " selected" : ""}>${e.display_label}</option>`).join("");
    return base + `<option value="CANCELLED"${orderStatus === "CANCELLED" ? " selected" : ""}>Cancelado</option>`;
  };

  const customFieldsDefs = config.custom_fields_config || [];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-left">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Tiquete</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Detalle & Ubicación</th>
            <th className="px-4 py-3">Saldo</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-400">No hay pedidos con este filtro.</td></tr>
          ) : orders.map((o) => {
            const loyaltyData = loyalty[o.customer_phone];
            const cf = o.custom_fields || {};
            const hasAddr = cf.direccion || cf.delivery_address || cf.address || cf.direccion_entrega;
            const isFinal = o.status === "CANCELLED" || isDeliveredStatus(o.status, config);
            return (
              <tr key={o.id} className="align-top hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <strong className="font-extrabold text-slate-900">#{o.order_number}</strong>
                  {loyaltyData && (
                    <span className="mt-1 inline-block rounded-full bg-warning-50 px-2 py-0.5 text-xs font-extrabold text-warning-700" title={`Fidelidad: ${loyaltyData.stamps_count} de ${loyaltyData.stamps_target} sellos`}>
                      🎟️ {loyaltyData.stamps_count}/{loyaltyData.stamps_target}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{o.customer_name || "—"}</div>
                  <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  <div>{o.items_text}</div>
                  {cf.service_type && <small className="block font-bold text-info-700">🧺 {cf.service_type}</small>}
                  {customFieldsDefs.map((def: any) => {
                    const v = formatCustomFieldDisplay(cf[def.field_key], def);
                    if (!v) return null;
                    return <small key={def.field_key} className="block text-[11px] text-slate-500"><strong>{def.display_label}:</strong> {v}</small>;
                  })}
                  <span dangerouslySetInnerHTML={{ __html: buildConfirmationDisplay(o) }} />
                </td>
                <td className="px-4 py-3 font-extrabold text-slate-900">{money.format(o.balance)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <StatusTag label={statusLabels[o.status] || o.status} statusKey={o.status} flow={config.status_flow_config} className="w-fit" />
                    <select className="w-fit rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold"
                      value={o.status} onChange={(e) => onChangeStatus(o, e.target.value)}>
                      {statusOptions(o.status).split("</option>").filter((x) => x.trim()).map((opt, i) => {
                        const m = opt.match(/value="([^"]+)"([^>]*)>([^<]+)/);
                        return m ? <option key={i} value={m[1]}>{m[3]}</option> : null;
                      })}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => onOpenQr(o)} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">📸 QR</button>
                    <a href={buildWaLink(o, "default", config, slug)} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">WhatsApp</a>
                    <a href={`${window.location.origin}/tiquete?number=${encodeURIComponent(String(o.order_number))}&slug=${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">🌐</a>
                    {hasAddr && !isFinal && (
                      <button onClick={() => onOpenDeliveryLink(o)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">🚚 Link Entrega</button>
                    )}
                    {!isFinal && (
                      <button onClick={() => onRequestApproval(o)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">🧾 Cotización</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile Cards ─────────────────────────────────────────────────────

function OrderCards({ orders, loyalty, config, slug, onOpenQr, onChangeStatus }: {
  orders: any[]; loyalty: Record<string, any>; config: BusinessConfig; slug: string;
  onOpenQr: (o: any) => void; onChangeStatus: (o: any, s: string) => void;
}) {
  const statusLabels = getStatusLabels(config);
  return (
    <div className="space-y-3 lg:hidden">
      {orders.length === 0 && <div className="rounded-lg bg-white p-6 text-center font-bold text-slate-400">No hay pedidos con este filtro.</div>}
      {orders.map((o) => {
        const loyaltyData = loyalty[o.customer_phone];
        const cf = o.custom_fields || {};
        const hasAddr = cf.direccion || cf.delivery_address || cf.address || cf.direccion_entrega;
        const isFinal = o.status === "CANCELLED" || isDeliveredStatus(o.status, config);
        return (
          <div key={o.id} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong className="text-lg font-extrabold text-slate-900">#{o.order_number}</strong>
                  <StatusTag label={statusLabels[o.status] || o.status} statusKey={o.status} flow={config.status_flow_config} />
                  {loyaltyData && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-extrabold text-warning-700">🎟️ {loyaltyData.stamps_count}/{loyaltyData.stamps_target}</span>}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{o.customer_name || "—"}</div>
                <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
              </div>
              <select className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm font-bold" value={o.status} onChange={(e) => onChangeStatus(o, e.target.value)}>
                {(config.status_flow_config || []).map((entry: any) => (
                  <option key={entry.status_key} value={entry.status_key}>{entry.display_label}</option>
                ))}
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
            <div className="mt-2 text-sm text-slate-700">{o.items_text}</div>
            {cf.service_type && <div className="mt-1 text-xs font-bold text-info-700">🧺 {cf.service_type}</div>}
            <span className="mt-1 block text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: buildConfirmationDisplay(o) }} />
            <div className="mt-3 flex items-center justify-between">
              <strong className={o.balance > 0 ? "font-extrabold text-error-700" : "font-extrabold text-success-700"}>
                Saldo: {money.format(o.balance)}
              </strong>
              <div className="flex items-center gap-2">
                <button onClick={() => onOpenQr(o)} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-bold text-white">📸 QR</button>
                <a href={buildWaLink(o, "default", config, slug)} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold">📱 WhatsApp</a>
                <a href={`${window.location.origin}/tiquete?number=${encodeURIComponent(String(o.order_number))}&slug=${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold">🌐 Ver</a>
                {hasAddr && !isFinal && (
                  <button onClick={() => { /* handled via table props only */ }} className="hidden">🚚</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────

function KanbanBoard({ orders, config, onChangeStatus, onOpenQr, onOpenDeliveryLink, onRequestApproval, toastFn }: {
  orders: any[]; config: BusinessConfig;
  onChangeStatus: (o: any, s: string) => void; onOpenQr: (o: any) => void;
  onOpenDeliveryLink: (o: any) => void; onRequestApproval: (o: any) => void; toastFn: (m: string) => void;
}) {
  const columns = useMemo(() => {
    const keys = [...(config.status_flow_config || []).map((s: any) => s.status_key), "CANCELLED"];
    const labels = getStatusLabels(config);
    return keys.map((k) => ({ key: k, label: labels[k] || k, items: orders.filter((o) => o.status === k) }));
  }, [orders, config]);

  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
      {columns.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragId) {
              onChangeStatus(orders.find((o) => o.id === dragId)!, col.key);
              setDragId(null);
            }
          }}
          className="w-[86vw] max-w-[86vw] shrink-0 snap-center rounded-xl border border-slate-200 bg-slate-50 p-3 md:w-auto md:max-w-none"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <StatusTag label={col.label} statusKey={col.key} flow={config.status_flow_config} />
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.map((o) => (
              <div
                key={o.id}
                draggable
                onDragStart={() => setDragId(o.id)}
                className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-slate-900">#{o.order_number}</strong>
                  <span className="text-xs font-bold text-slate-500">{o.customer_name || "—"}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{o.items_text}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                  <strong className={o.balance > 0 ? "text-xs font-extrabold text-error-700" : "text-xs font-extrabold text-success-700"}>
                    {o.balance > 0 ? "Saldo " + money.format(o.balance) : "Pagado"}
                  </strong>
                  <span className="flex gap-1.5">
                    <button onClick={() => onOpenQr(o)} className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">📸</button>
                    <button onClick={() => onRequestApproval(o)} className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-bold" disabled={o.status === "CANCELLED" || isDeliveredStatus(o.status, config)}>🧾</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

function PanelInner() {
  const params = useSearchParams();
  const initialSlug = params.get("slug") || "majesty";
  const hasSlugParam = params.has("slug");

  const [slug, setSlug] = useState(initialSlug);
  const [config, setConfig] = useState<BusinessConfig>({ ...FALLBACK_CONFIG });
  const [orders, setOrders] = useState<any[]>(JSON.parse(typeof window === "undefined" ? "null" : (localStorage.getItem("tiquete_orders") || "null")) || []);
  const [loyalty, setLoyalty] = useState<Record<string, any>>({});
  const [loginVisible, setLoginVisible] = useState(!getStoredToken());
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginError, setLoginError] = useState("");
  const [dataStatus, setDataStatus] = useState("Demo activa");
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<number | null>(null);

  useBrandTheme(config.business_color || null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"table" | "kanban">("table");
  // Top-level panel tab. The "Fruver" tab only appears for fruver businesses.
  const [panelTab, setPanelTab] = useState<"orders" | "fruver">("orders");
  const [currentPage, setCurrentPage] = useState(1);
  // Default to 25 on the server (no localStorage during SSR); the stored
  // preference is hydrated on the client in the effect below.
  const [pageSize, setPageSizeState] = useState<number>(25);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = parseInt(window.localStorage.getItem("tiquete_page_size") || "25", 10);
    if ([10, 25, 50, 100].includes(stored)) setPageSizeState(stored);
  }, []);

  const [qrOrder, setQrOrder] = useState<any>(null);
  const [deliveryPhotoFor, setDeliveryPhotoFor] = useState<any>(null);
  const [deliveryLinkOrder, setDeliveryLinkOrder] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ order: any; waLink: string; liveUrl: string; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  function toast(message: string) {
    setToastMsg(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(""), 2800);
  }

  const refreshOrders = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const res = await apiGetJSON(`/api/list-orders?slug=${encodeURIComponent(slug)}&include_loyalty=1`);
      if (!res.ok) throw new Error("No se pudo conectar. Seguimos en modo demo.");
      const ordersData: any[] = res.data.orders || [];
      setOrders(ordersData.map(normalizeOrder));
      setLoyalty(res.data.loyalty_summaries || {});
      localStorage.setItem("tiquete_orders", JSON.stringify(ordersData.map(normalizeOrder)));
      setDataStatus("Guardado en la nube");
      toast("Pedidos actualizados");
    } catch (err: any) {
      setDataStatus("Demo activa");
      toast(err.message || "Error de conexión");
    }
  }, [slug]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiGetJSON(`/api/get-business-config?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Config fetch failed");
      const cfg = { ...FALLBACK_CONFIG, ...res.data };
      setConfig(cfg);
      setDataStatus("Guardado en la nube");
    } catch {
      setConfig({ ...FALLBACK_CONFIG });
    }
  }, [slug]);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setLoginVisible(false);
      fetchConfig().then(refreshOrders);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const email = (document.getElementById("loginEmail") as HTMLInputElement).value.trim();
    const password = (document.getElementById("loginPassword") as HTMLInputElement).value;
    setLoginError("");
    try {
      const res = await apiPostJSON("/api/auth-login", { email, password });
      if (!res.ok) throw new Error(res.data?.message || "Credenciales inválidas");
      localStorage.setItem("tiquete_auth_token", res.data.token);
      setCurrentUser(res.data.user || null);
      setLoginVisible(false);
      await fetchConfig();
      await refreshOrders();
    } catch (err: any) {
      setLoginError(err.message || "No se pudo iniciar sesión");
    }
  }

  function handleLogout() {
    localStorage.removeItem("tiquete_auth_token");
    setCurrentUser(null);
    setLoginVisible(true);
  }

  async function handleChangeStatus(order: any, newStatus: string) {
    if (order.id.startsWith("demo-")) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
      setDeliveryPhotoFor(null);
      toast("Estado actualizado localmente");
      return;
    }
    if (isDeliveredStatus(newStatus, config)) {
      if (config.plan !== "paid") {
        await doChangeOrderStatus(order.id, newStatus, null);
        return;
      }
      setDeliveryPhotoFor({ order, newStatus });
      return;
    }
    await doChangeOrderStatus(order.id, newStatus, null);
  }

  async function doChangeOrderStatus(orderId: string, newStatus: string, deliveryPhoto: string | null) {
    try {
      const payload: any = { id: orderId, status: newStatus, slug };
      if (deliveryPhoto) payload.deliveryPhoto = deliveryPhoto;
      const res = await apiFetch("/api/update-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Error al actualizar estado");
      }
      const updated = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === orderId ? normalizeOrder(updated) : o)));
      localStorage.setItem("tiquete_orders", JSON.stringify(orders.map(normalizeOrder)));
      toast("Estado actualizado en la nube");
    } catch (err: any) {
      toast(err.message || "Error al actualizar estado");
    }
  }

  async function openDeliveryLinkFor(order: any) {
    setDeliveryLinkOrder(order);
  }

  async function requestApproval(order: any) {
    if (!config.business_id) {
      toast("Configuración del negocio no disponible");
      return;
    }
    const amountRaw = window.prompt("Valor de la cotización (COP):", String(order.total || ""));
    if (amountRaw === null) return;
    const amount = Number(String(amountRaw).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      toast("Valor inválido");
      return;
    }
    const description = window.prompt("Descripción de la cotización (opcional):", order.items_text || "") || "";
    const res = await apiPostJSON("/api/approval-decide", {
      action: "generate",
      order_id: order.id,
      business_id: config.business_id,
      amount,
      description
    });
    if (!res.ok) {
      toast(res.data?.message || res.data?.error || "Error al solicitar aprobación");
      return;
    }
    toast("Cotización enviada por WhatsApp. Link copiado al portapapeles.");
    try {
      await navigator.clipboard.writeText(res.data.approval_link || "");
    } catch { /* ignore */ }
  }

  function handleScanned(payload: string) {
    setScannerOpen(false);
    const m = payload.match(/\/tiquete[^?#]*\?[^#]*number=([^&]+)/i) || payload.match(/number=([^&\s]+)/i);
    const detectedNumber = m ? decodeURIComponent(m[1]) : payload.trim().replace(/^#/, "");
    if (detectedNumber) {
      setSearch(detectedNumber);
      const found = orders.find((o) => String(o.order_number) === String(detectedNumber));
      if (found) {
        setQrOrder(found);
        toast(`Tiquete #${detectedNumber} encontrado`);
      } else {
        toast(`No encontrado: #${detectedNumber}. Busca un poco...`);
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cashReport() {
    const today = new Date().toLocaleDateString("es-CO");
    const businessName = config.business_name || "TiqueteVivo";
    const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalPaid = orders.reduce((s, o) => s + Number(o.paid || 0), 0);
    const totalBalance = orders.reduce((s, o) => s + Number(o.balance || 0), 0);
    const readyStatusKey = findReadyStatus(config);
    const readyCount = orders.filter((o) => o.status === readyStatusKey).length;
    const reportText = [
      `📊 *CIERRE DE CAJA DIARIA — ${businessName}*`,
      `📅 Fecha: ${today}`,
      `----------------------------------------`,
      `📥 Total pedidos creados: ${orders.length}`,
      `💰 Ventas totales: ${money.format(totalSales)}`,
      `💵 Ingresado a Caja (Abonos): ${money.format(totalPaid)}`,
      `💸 Saldos por cobrar: ${money.format(totalBalance)}`,
      `✅ Pedidos listos para entregar: ${readyCount}`,
      `----------------------------------------`,
      `🌱 *Operación 100% Digital y Cero Papel*`
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank", "noopener");
    toast("Reporte de Cierre de Caja generado para WhatsApp");
  }

  function onOrderCreated(order: any, waLink: string, liveUrl: string, message: string) {
    const coll: any[] = [...orders];
    coll.unshift(order);
    setOrders(coll);
    setReceipt({ order, waLink, liveUrl, message });
    try { localStorage.setItem("tiquete_orders", JSON.stringify(coll)); } catch { /* ignore */ }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    taskRefreshOrders();
  }

  function taskRefreshOrders() {
    if (getStoredToken()) {
      refreshOrders();
    }
  }

  // Derived: filtered + paginated
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) =>
      (!statusFilter || o.status === statusFilter) &&
      (`${o.order_number} ${o.customer_name} ${o.items_text} ${o.custom_fields?.rack_location || ""}`.toLowerCase().includes(q))
    );
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageOrders = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  function resetPage() { setCurrentPage(1); }

  // Detect the fruver vertical from the loaded config to gate the Fruver tab
  // (R4.1, R5.4, R6.1). If the active business is not fruver, force the tab
  // back to orders so a stale selection never hides the orders view.
  const isFruver = isFruverVertical({
    verticalName: config.vertical_name,
    businessSlug: config.business_slug || slug
  });
  const activePanelTab = isFruver ? panelTab : "orders";

  function changeSlug(newSlug: string) {
    if (!newSlug) return;
    window.location.href = `/panel?slug=${encodeURIComponent(newSlug)}`;
  }

  const businesses = useBusinessList(slug, config, hasSlugParam);

  return (
    <main className="min-h-screen bg-slate-50">
      {loginVisible && <LoginOverlay onLogin={handleLogin} error={loginError} />}

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden max-h-screen w-[260px] flex-col justify-between overflow-auto border-r border-white/5 bg-gradient-to-b from-slate-900 to-slate-800 p-6 text-white lg:flex">
          <div>
            <div className="mb-7 flex items-center gap-3 text-lg font-extrabold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 font-black">TV</span>
              TiqueteVivo
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-xs font-bold uppercase text-slate-300">Negocio activo</label>
              <select value={slug} onChange={(e) => changeSlug(e.target.value)} disabled={hasSlugParam}
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 font-bold text-white disabled:opacity-60">
                <option value="" className="text-slate-900">Cargando…</option>
                {businesses.map((b: any) => (
                  <option key={b.slug} value={b.slug} className="text-slate-900">
                    {b.vertical_emoji || ""} {b.name}
                  </option>
                ))}
              </select>
            </div>
            <nav className="grid gap-2 text-sm">
              <span className="rounded-md bg-slate-800/30 px-3 py-2 font-bold text-white">📋 Pedidos</span>
              <span className="rounded-md px-3 py-2 font-bold text-slate-400" title="Próximamente">💰 Caja</span>
              <span className="rounded-md px-3 py-2 font-bold text-slate-400" title="Próximamente">👥 Clientes</span>
              <Link href="/registro" className="rounded-md px-3 py-2 font-bold text-slate-400 hover:text-white">⚙️ Registrar negocio</Link>
            </nav>
          </div>
          <div>
            {currentUser && <div className="mb-2 rounded-md bg-white/10 px-3 py-2 text-sm font-bold">👤 {currentUser.email}</div>}
            <button onClick={handleLogout} className="mb-3 w-full rounded-md bg-slate-700 px-3 py-2 font-bold text-white hover:bg-slate-600">🚪 Cerrar sesión</button>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300">Estado de datos</label>
              <div className="mt-2 rounded-md bg-success-900/20 px-3 py-2 text-center text-sm font-bold text-success-300">{dataStatus}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={taskRefreshOrders} className="flex-1 rounded-md bg-white py-2 font-bold text-slate-900">🔄 Actualizar</button>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <div className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-slate-900">
                  {activePanelTab === "fruver" ? "Panel Fruver" : "Pedidos del día"}
                </h1>
                <div className="text-sm text-slate-500">
                  <span className="font-extrabold">{config.vertical_emoji}{config.vertical_emoji ? " " : ""}{config.business_name}</span>
                </div>
                {isFruver && (
                  <div role="tablist" aria-label="Secciones del panel" className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      role="tab"
                      aria-selected={activePanelTab === "orders"}
                      onClick={() => setPanelTab("orders")}
                      className={`rounded px-3 py-1.5 text-sm font-bold ${activePanelTab === "orders" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                    >
                      📋 Pedidos
                    </button>
                    <button
                      role="tab"
                      aria-selected={activePanelTab === "fruver"}
                      onClick={() => setPanelTab("fruver")}
                      className={`rounded px-3 py-1.5 text-sm font-bold ${activePanelTab === "fruver" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                    >
                      🥬 Fruver
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={() => { setReceipt(null); setFormOpen(true); }}>＋ Nuevo tiquete</Button>
                <Button variant="secondary" onClick={() => setScannerOpen(true)}>📸 Escanear QR</Button>
                <div className="hidden md:inline-flex">
                  <Button variant="primary" onClick={cashReport}>📊 Cierre de Caja</Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-[1400px] px-4 py-6">
            {activePanelTab === "fruver" ? (
              <FruverPanel
                businessId={config.business_id}
                slug={slug}
                businessName={config.business_name}
                toastFn={toast}
              />
            ) : (
            <>
            {/* Stats */}
            <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Pedidos</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{orders.length}</strong>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Ventas</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{money.format(orders.reduce((s, o) => s + Number(o.total || 0), 0))}</strong>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Saldos</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{money.format(orders.reduce((s, o) => s + Number(o.balance || 0), 0))}</strong>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Listos</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{orders.filter((o) => o.status === findReadyStatus(config)).length}</strong>
              </div>
            </section>

            {/* Orders panel */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card lg:col-span-1">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <strong className="text-lg font-extrabold text-slate-900">Órdenes recientes</strong>
                  <div className="text-sm text-slate-500">Últimas entradas y filtros rápidos</div>
                </div>
                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                  <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                    placeholder="🔍 Buscar cliente o tiquete" className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 md:w-56 md:flex-1" />
                  <div className="flex w-full gap-2 md:w-auto">
                    <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 md:w-auto">
                      <option value="">Todos</option>
                      {(config.status_flow_config || []).map((s: any) => (
                        <option key={s.status_key} value={s.status_key}>{s.display_label}</option>
                      ))}
                      <option value="CANCELLED">Cancelado</option>
                    </select>
                    <div className="inline-flex flex-none rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      <button onClick={() => setView("table")} className={`rounded px-2 py-1 text-sm font-bold ${view === "table" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>📋 Lista</button>
                      <button onClick={() => setView("kanban")} className={`rounded px-2 py-1 text-sm font-bold ${view === "kanban" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>🗂️ Tablero</button>
                    </div>
                  </div>
                </div>
              </div>

              {view === "table" ? (
                <>
                  <div className="hidden lg:block">
                    <OrdersTable
                      orders={pageOrders}
                      loyalty={loyalty}
                      config={config}
                      slug={slug}
                      onOpenQr={setQrOrder}
                      onChangeStatus={handleChangeStatus}
                      onOpenDeliveryLink={openDeliveryLinkFor}
                      onRequestApproval={requestApproval}
                      onOpenScanner={() => setScannerOpen(true)}
                    />
                  </div>
                  <OrderCards
                    orders={pageOrders}
                    loyalty={loyalty}
                    config={config}
                    slug={slug}
                    onOpenQr={setQrOrder}
                    onChangeStatus={handleChangeStatus}
                  />
                </>
              ) : (
                <KanbanBoard
                  orders={filtered}
                  config={config}
                  onChangeStatus={handleChangeStatus}
                  onOpenQr={setQrOrder}
                  onOpenDeliveryLink={openDeliveryLinkFor}
                  onRequestApproval={requestApproval}
                  toastFn={toast}
                />
              )}

              {/* Pagination */}
              <div className="mt-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <span className="text-sm font-bold text-slate-500">
                  Mostrando {(clampedPage - 1) * pageSize + (filtered.length ? 1 : 0)}–{Math.min(clampedPage * pageSize, filtered.length)} de {filtered.length} pedidos
                </span>
                <div className="flex items-center gap-2">
                  <select value={pageSize} onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPageSizeState(v);
                    localStorage.setItem("tiquete_page_size", String(v));
                    resetPage();
                  }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm">
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1} className="rounded-md border border-slate-200 px-3 py-1 text-sm font-bold disabled:opacity-40">‹ Anterior</button>
                  <span className="text-sm font-bold text-slate-600">Página {clampedPage} de {totalPages}</span>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage >= totalPages} className="rounded-md border border-slate-200 px-3 py-1 text-sm font-bold disabled:opacity-40">Siguiente ›</button>
                </div>
              </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Coupon panel */}
              <CouponPanel orders={orders} toastFn={toast} onRedeemed={taskRefreshOrders} />
              {/* Help card */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <strong className="mb-2 block font-extrabold text-slate-900">🆘 ¿Cómo funciona?</strong>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  <li>Usa <strong>＋ Nuevo tiquete</strong> para registrar un pedido y enviarlo por WhatsApp.</li>
                  <li>Con <strong>📸 Escanear QR</strong> identifica una orden desde el QR del mostrador.</li>
                  <li>Cambia el estado desde la tabla o arrastra en el tablero.</li>
                  <li>Envía una <strong>🧾 Cotización</strong> cuando haya valores adicionales.</li>
                </ul>
              </div>
            </div>
            </>
            )}
          </div>

          {/* Mobile bottom nav */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden">
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="py-2 text-center"><span className="block text-lg">📋</span><small className="font-bold text-slate-500">Pedidos</small></button>
            <button onClick={() => setScannerOpen(true)} className="py-2 text-center"><span className="block text-lg">📸</span><small className="font-bold text-slate-500">Escanear</small></button>
            <button onClick={taskRefreshOrders} className="py-2 text-center"><span className="block text-lg">🔄</span><small className="font-bold text-slate-500">Actualizar</small></button>
            <button onClick={cashReport} className="py-2 text-center"><span className="block text-lg">📊</span><small className="font-bold text-slate-500">Caja</small></button>
          </nav>
          <div className="h-16 lg:hidden" />
        </div>
      </div>

      {/* Form drawer */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/40 lg:items-stretch" onClick={() => { setFormOpen(false); setReceipt(null); }}>
          <div className="h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl lg:h-auto lg:max-h-full lg:w-[420px] lg:rounded-none"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <strong className="font-display text-lg font-extrabold text-slate-900">✅ Nuevo Tiquete Digital</strong>
              <button onClick={() => { setFormOpen(false); setReceipt(null); }} className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <OrderForm config={config} slug={slug} toastFn={toast} onCreated={onOrderCreated} />
            {receipt && <Receipt order={receipt.order} waLink={receipt.waLink} liveUrl={receipt.liveUrl} message={receipt.message} />}
          </div>
        </div>
      )}

      {/* Modals */}
      {qrOrder && <QrModal order={qrOrder} config={config} slug={slug} onClose={() => setQrOrder(null)} />}
      {deliveryPhotoFor && (
        <DeliveryPhotoModal
          onSkip={() => {
            const info = deliveryPhotoFor;
            setDeliveryPhotoFor(null);
            if (info) doChangeOrderStatus(info.order.id, info.newStatus, null);
          }}
          onConfirm={(photo) => {
            const info = deliveryPhotoFor;
            setDeliveryPhotoFor(null);
            if (info) doChangeOrderStatus(info.order.id, info.newStatus, photo);
          }}
        />
      )}
      {deliveryLinkOrder && (
        <DeliveryLinkModal order={deliveryLinkOrder} businessId={config.business_id} toastFn={toast} onClose={() => setDeliveryLinkOrder(null)} />
      )}
      {scannerOpen && <ScannerModal onDetect={handleScanned} onClose={() => setScannerOpen(false)} />}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8">
          {toastMsg}
        </div>
      )}
    </main>
  );
}

// Small hook to load the business list for the selector
function useBusinessList(slug: string, config: BusinessConfig, hasSlugParam: boolean) {
  const [businesses, setBusinesses] = useState<any[]>([]);
  useEffect(() => {
    if (hasSlugParam) {
      setBusinesses([{ slug, name: config.business_name, vertical_emoji: config.vertical_emoji }]);
      return;
    }
    apiGetJSON("/api/list-businesses")
      .then((res) => {
        if (res.ok) setBusinesses(res.data || []);
      })
      .catch(() => {});
  }, [slug, hasSlugParam, config.business_name, config.vertical_emoji]);
  return businesses;
}

function PanelFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function PanelPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <PanelInner />
    </Suspense>
  );
}