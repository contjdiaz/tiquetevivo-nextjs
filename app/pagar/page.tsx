"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiPostJSON, buildPaymentMethodLines, money } from "@/lib/client";

const CACHE_TTL_MS = 30000;

type State = "loading" | "valid" | "cancelled" | "paid" | "not_found" | "error";

function PagarInner() {
  const params = useSearchParams();
  const orderId = params.get("order_id") || "";
  const token = params.get("token") || "";

  const [state, setState] = useState<State>("loading");
  const [order, setOrder] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [mode, setMode] = useState<"direct" | "gateway">("direct");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const cacheKey = `${orderId}.${token}`;
  const cacheRef = useRef<{ key: string; data: any; ts: number } | null>(null);

  useEffect(() => {
    if (!orderId || !token) {
      setState("not_found");
      return;
    }

    async function validate() {
      const now = Date.now();
      const cached = cacheRef.current;
      if (cached && cached.key === cacheKey && now - cached.ts < CACHE_TTL_MS) {
        applyData(cached.data);
        return;
      }
      try {
        const res = await apiFetch(`/api/validate-payment?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          cacheRef.current = { key: cacheKey, data, ts: now };
          applyData(data);
        } else if (res.status === 404) {
          setState("not_found");
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
    }
    validate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, token]);

  function applyData(data: any) {
    if (data.paid) {
      setState("paid");
      return;
    }
    if (data.cancelled) {
      setState("cancelled");
      return;
    }
    setOrder(data.order || data);
    setBusiness(data.business || null);
    setState("valid");
  }

  async function handleGatewayPay() {
    if (paying) return;
    setPaying(true);
    setError("");
    const result = await apiPostJSON("/api/create-payment-intent", { order_id: orderId });
    if (!result.ok || !result.data?.checkout_url) {
      setError(result.data?.error || "No se pudo iniciar el pago.");
      setPaying(false);
      return;
    }
    window.location.assign(result.data.checkout_url);
  }

  const balance = Number(order?.balance ?? Number(order?.total ?? 0));
  const lines = buildPaymentMethodLines(business?.payment_config);

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-lg px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          {state === "loading" && (
            <div className="py-10 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
              <p className="mt-4 font-bold text-slate-600">Verificando pedido…</p>
            </div>
          )}

          {state === "not_found" && (
            <div className="py-10 text-center">
              <span className="text-4xl">🔎</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">Enlace no válido</h1>
              <p className="mt-1 text-sm text-slate-600">Este enlace de pago no existe o ya expiró.</p>
            </div>
          )}

          {state === "paid" && (
            <div className="py-10 text-center">
              <span className="text-5xl">✅</span>
              <h1 className="mt-3 text-xl font-extrabold text-success-700">Este pedido ya está pagado</h1>
              <p className="mt-1 text-sm text-slate-600">Gracias. No hay saldo pendiente por este tiquete.</p>
            </div>
          )}

          {state === "cancelled" && (
            <div className="py-10 text-center">
              <span className="text-4xl">🚫</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">Pedido cancelado</h1>
              <p className="mt-1 text-sm text-slate-600">Este pedido fue cancelado. Hablemos con el negocio.</p>
            </div>
          )}

          {state === "error" && (
            <div className="py-10 text-center">
              <span className="text-4xl">⚠️</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">No pudimos verificar</h1>
              <p className="mt-1 text-sm text-slate-600">Inténtalo de nuevo en unos segundos. El número del mensaje coincide con el código?</p>
            </div>
          )}

          {state === "valid" && order && (
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-xl">{business?.vertical_emoji || "🧺"}</span>
                <strong className="text-slate-900">{business?.name || "Pedido"}</strong>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Tiquete <strong className="text-slate-800">#{order.order_number || "—"}</strong>
              </p>
              {order.items_text && <p className="mt-1 text-sm text-slate-600">{order.items_text}</p>}

              <div className="mt-4 rounded-xl bg-slate-100 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <strong className="text-slate-800">{money.format(Number(order.total || 0))}</strong>
                </div>
                {Number(order.paid || 0) > 0 && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-500">Abono</span>
                    <strong className="text-slate-800">{money.format(Number(order.paid))}</strong>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-sm">
                  <span className="font-extrabold text-slate-500">Saldo a pagar</span>
                  <strong className="text-brand-700">{money.format(balance)}</strong>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setMode("direct")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-extrabold ${mode === "direct" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  Transfiere a nuestra cuenta
                </button>
                <button
                  onClick={() => setMode("gateway")}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-extrabold ${mode === "gateway" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  Pago en línea
                </button>
              </div>

              {mode === "direct" ? (
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm text-slate-600">Transfiere {money.format(balance)} a:</p>
                  <div className="mt-2 space-y-1 text-sm font-bold text-slate-800">
                    {lines.map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Importante: si pagas por transferencia, envíanos el comprobante por WhatsApp para confirmar el abono.
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  {error && <p className="mb-2 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">{error}</p>}
                  <button
                    onClick={handleGatewayPay}
                    disabled={paying || balance <= 0}
                    className="w-full rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    {paying ? "Creando pago…" : `💳 Pagar ${money.format(balance)} en línea`}
                  </button>
                </div>
              )}

              <p className="mt-6 text-center text-xs text-slate-400">
                Si pagas por transferencia, confirma con el negocio y el estado se actualizará al verificar el comprobante.
              </p>
            </div>
          )}

          {(state === "paid" || state === "cancelled" || state === "not_found") && (
            <div className="mt-4 text-center">
              <Link href="/buscar" className="text-sm font-bold text-brand-700 hover:underline">Buscar otro pedido</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function PagarFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function PagarPage() {
  return (
    <Suspense fallback={<PagarFallback />}>
      <PagarInner />
    </Suspense>
  );
}