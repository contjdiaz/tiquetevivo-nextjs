"use client";

import { useState } from "react";
import { apiPostJSON, digitsOnly, money } from "@/lib/client";

/** Modal para generar y compartir el link de confirmación de entrega con el domiciliario. */
export default function DeliveryLinkModal({ order, businessId, onClose, toastFn }: { order: any; businessId: string; onClose: () => void; toastFn: (m: string) => void }) {
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
          <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><span aria-hidden="true">✕</span></button>
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
