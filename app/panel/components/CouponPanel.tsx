"use client";

import { useState } from "react";
import { apiGetJSON, apiPostJSON, money } from "@/lib/client";

/** Panel para validar y canjear cupones aplicándolos a un pedido existente. */
export default function CouponPanel({ orders, toastFn, onRedeemed }: { orders: any[]; toastFn: (m: string) => void; onRedeemed: () => void }) {
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
