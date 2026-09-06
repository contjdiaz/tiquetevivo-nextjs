"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import StatusTag from "@/components/ui/StatusTag";
import Card from "@/components/ui/Card";
import BalanceBanner from "@/components/ui/BalanceBanner";
import CustomFieldsGrid from "@/components/ui/CustomFieldsGrid";
import { apiGetJSON, apiPostJSON, buildPaymentMethodLines, detectPaymentReturn, formatCustomFieldValue, money, normalizeOrder } from "@/lib/client";
import { useBrandTheme } from "@/lib/brand-theme";

type Mode = "track" | "pickup" | "review";

function phaseForStatus(status: string): string {
  switch (status) {
    case "RECEIVED":
    case "IN_PROGRESS":
      return "processing";
    case "READY":
      return "ready";
    case "DELIVERED":
      return "done";
    case "CANCELLED":
      return "cancelled";
    default:
      return "processing";
  }
}

function defaultModeForPhase(phase: string): Mode {
  switch (phase) {
    case "ready": return "pickup";
    case "done": return "review";
    case "cancelled": return "track";
    default: return "track";
  }
}

const MODE_LABELS: Record<Mode, string> = {
  track: "Seguimiento",
  pickup: "Para recoger",
  review: "Reseña"
};

function buildTrackPayload(orderNumber: string | number, slug: string): string {
  return `${window.location.origin}/tiquete?number=${encodeURIComponent(String(orderNumber))}&slug=${encodeURIComponent(slug)}`;
}

function buildPickupPayload(orderId: string, orderNumber: string | number, slug: string): string {
  return `TIQUETEVIVO:PICKUP|ID:${orderId}|NUM:${orderNumber}|SLUG:${slug}`;
}

function PaymentButton({ orderId, balance, ticketToken }: { orderId: string; balance: number; ticketToken?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handlePay() {
    if (loading) return;
    setLoading(true);
    setError("");
    const result = await apiPostJSON("/api/create-payment-intent", { order_id: orderId, ticket_token: ticketToken });
    if (!result.ok || !result.data?.checkout_url) {
      setError(result.data?.error || "No se pudo iniciar el pago.");
      setLoading(false);
      return;
    }
    setSuccess("Redirigiendo a la pasarela de pago…");
    window.location.assign(result.data.checkout_url);
  }

  return (
    <div className="mt-4">
      <button
        onClick={handlePay}
        disabled={loading || Boolean(success)}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 font-extrabold text-white shadow-card transition-transform hover:-translate-y-px disabled:opacity-60"
      >
        💳 Pagar saldo pendiente — {money.format(balance)}
      </button>
      {error && <p className="mt-2 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">{error}</p>}
      {success && <p className="mt-2 rounded-lg bg-success-50 px-3 py-2 text-sm font-bold text-success-700">{success}</p>}
    </div>
  );
}

function ApprovalBox({ approval, onDecide }: { approval: any; onDecide: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(json: any) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await apiPostJSON("/api/approval-decide", json);
    if (!result.ok || !result.data?.success) {
      setError(result.data?.detail || result.data?.error || "No se pudo procesar.");
      setBusy(false);
      return;
    }
    onDecide();
  }

  return (
    <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4">
      <strong className="text-slate-900">¿Apruebas este valor adicional?</strong>
      <p className="mt-1 text-sm text-slate-600">{approval.description || "Cargo adicional al pedido."}</p>
      <div className="mt-2">
        <span className="text-2xl font-extrabold text-warning-700">{money.format(Number(approval.amount || 0))}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => decide({ action: "approve", id: approval.id, token: approval.token })}
          disabled={busy}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2 font-extrabold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Aprobar
        </button>
        <button
          onClick={() => decide({ action: "reject", id: approval.id, token: approval.token })}
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Rechazar
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-bold text-error-700">{error}</p>}
    </div>
  );
}

function LoyaltyWidget({ loyalty }: { loyalty: any }) {
  if (!loyalty) return null;
  const stamps = Math.min(Number(loyalty.stamps_count || 0), Number(loyalty.stamps_target || 1));
  const target = Math.max(1, Number(loyalty.stamps_target || 1));
  const rewards = Number(loyalty.reward_available || 0);
  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between">
        <strong className="text-slate-900">Tu tarjeta de fidelidad</strong>
        <span className="text-sm font-extrabold text-brand-700">{stamps}/{target}</span>
      </div>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: target }).map((_, i) => (
          <span
            key={i}
            className={`h-9 flex-1 rounded-md text-sm ${i < stamps ? "bg-brand-600 text-white" : "bg-slate-100"}`}
          />
        ))}
      </div>
      {rewards > 0 && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-bold text-brand-800">
          ¡Tienes {rewards} {rewards === 1 ? "premio disponible" : "premios disponibles"}!
        </p>
      )}
    </Card>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}

function PaymentSection({ order, business }: { order: any; business: any }) {
  const balance = Number(order.balance ?? 0);
  if (balance <= 0) return null;
  const lines = buildPaymentMethodLines(business.payment_config);
  return (
    <Card className="mt-4 p-4">
      <strong className="text-slate-900">Saldo pendiente: <span className="text-brand-700">{money.format(balance)}</span></strong>
      <p className="mt-1 text-sm text-slate-600">Puedes pagar así:</p>
      <div className="mt-2 space-y-1 text-sm text-slate-700">
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <PaymentButton orderId={order.id} balance={balance} ticketToken={order.ticket_token} />
    </Card>
  );
}

function TiqueteInner() {
  const params = useSearchParams();
  const [order, setOrder] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [approval, setApproval] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentFeedback, setPaymentFeedback] = useState<"success" | "pending" | "failure" | null>(null);
  const [mode, setMode] = useState<Mode>("track");
  const [userOverride, setUserOverride] = useState(false);
  const hasInit = useRef(false);

  const number = params.get("number");
  const slug = params.get("slug");
  const ticketToken = params.get("ticket_token");

  useBrandTheme(business?.color || null);

  const fetchOrder = useCallback(async () => {
    try {
      let data: any;
      if (ticketToken) {
        const res = await apiGetJSON(`/api/list-orders?ticket_token=${encodeURIComponent(ticketToken)}&include_business=1`);
        if (!res.ok) throw new Error(res.data?.error || "Pedido no encontrado");
        data = res.data;
      } else if (number && slug) {
        const res = await apiGetJSON(`/api/public-ticket?number=${encodeURIComponent(number)}&slug=${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error(res.data?.error || "Pedido no encontrado");
        data = res.data;
      } else {
        throw new Error("Faltan parámetros del tiquete");
      }

      const ord = normalizeOrder(data.orders?.[0]);
      setOrder(ord);
      setBusiness(data.business || null);
      setLoyalty(data.loyalty || null);
      setApproval(approvalSafety(data.approval));
      setError("");

      const phase = phaseForStatus(ord.status);
      if (!userOverride) setMode(defaultModeForPhase(phase));
    } catch (err: any) {
      if (!hasInit.current) setError(err.message || "No se pudo cargar el tiquete.");
    } finally {
      setLoading(false);
      hasInit.current = true;
    }
  }, [number, slug, ticketToken, userOverride]);

  useEffect(() => {
    const fb = detectPaymentReturn(pageUrlSearch());
    if (fb) setPaymentFeedback(fb);

    fetchOrder();

    const timer = window.setInterval(() => {
      if (!ticketToken) fetchOrder();
      else {
        // poll only if user is not on a final terminal state
        fetchOrder();
      }
    }, 30000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchOrder();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchOrder]);

  function approvalSafety(a: any) {
    if (!a) return null;
    if (a.expires_at && new Date(a.expires_at).getTime() <= Date.now()) return null;
    return a;
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card">
          <div className="mx-auto h-20 w-20 rounded-full bg-slate-200" />
          <p className="mt-4 font-bold text-slate-600">Cargando tiquete…</p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card">
          <span className="text-4xl">😕</span>
          <h1 className="mt-3 text-xl font-extrabold text-slate-900">Tiquete no encontrado</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <Link href="/buscar" className="mt-4 block rounded-lg bg-brand-600 px-4 py-2 font-bold text-white hover:bg-brand-700">
            Buscar mi pedido
          </Link>
        </div>
      </main>
    );
  }

  const balance = Number(order.balance ?? 0);
  const phase = phaseForStatus(order.status);

  const qrPayload =
    mode === "pickup"
      ? buildPickupPayload(order.id, order.order_number, order.slug || business?.slug || "")
      : buildTrackPayload(order.order_number, order.slug || business?.slug || "");

  const flow = business?.status_flow_config?.length ? business.status_flow_config : [
    { status: "RECEIVED", label: "Recibimos tu pedido", when: "intake" },
    { status: "IN_PROGRESS", label: "Lo estamos procesando", when: "processing" },
    { status: "READY", label: "Listo para recoger", when: "ready" },
    { status: "DELIVERED", label: "Entregado", when: "delivered" }
  ];

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-[1100px] px-4 py-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-xl">
              {business?.vertical_emoji || "🧺"}
            </span>
            <div className="flex-1">
              <strong className="block text-slate-900">{business?.name || "Tu lavandería"}</strong>
              <span className="text-sm text-slate-500">
                {business?.slug && `/${business.slug}`}
              </span>
            </div>
            <Link href="/buscar" className="text-sm font-bold text-slate-500 hover:text-slate-800">¿Buscas otro pedido?</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1100px] px-4">
        {paymentFeedback && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            {paymentFeedback === "success" && <strong className="text-success-700">✓ Pago recibido. Vé nos actualiza automáticamente.</strong>}
            {paymentFeedback === "pending" && <strong className="text-warning-700">⏳ Pago en verificación. Este pedido se actualizará pronto.</strong>}
            {paymentFeedback === "failure" && <strong className="text-error-700">El pago no se completó. Puedes intentarlo de nuevo.</strong>}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Ticket card */}
          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm font-extrabold uppercase tracking-wide text-slate-500">Tiquete</span>
                <h1 className="font-display text-2xl text-slate-900">
                  #{order.order_number || "—"}
                </h1>
                <div className="mt-1.5">
                  <StatusTag
                    label={flow.find((s: any) => s.status === order.status)?.label || order.status || "—"}
                    statusKey={order.status}
                  />
                </div>
              </div>
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                🖨 Imprimir
              </button>
            </div>

            {order.customer_name && (
              <p className="mt-1 text-slate-600">
                <strong className="text-slate-800">{order.customer_name}</strong>
              </p>
            )}

            <div className="mt-6">
              {/* Status stepper */}
              <div className="relative flex items-start justify-between overflow-x-auto pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {phase === "cancelled" ? (
                  <div className="w-full rounded-lg bg-error-50 px-3 py-2 text-center font-extrabold text-error-700">
                    Este pedido fue cancelado. Consulta con el negocio.
                  </div>
                ) : (
                  flow.map((step: any, i: number) => {
                    const orderStatusIdx = flow.findIndex((s: any) => s.status === order.status);
                    const done = i < orderStatusIdx;
                    const current = i === orderStatusIdx;
                    return (
                      <div key={i} className="flex min-w-[108px] flex-1 shrink-0 snap-center items-center">
                        <div className="flex flex-col items-center text-center">
                          <span
                            className={`grid h-9 w-9 place-items-center rounded-full text-sm font-extrabold ${
                              current
                                ? "bg-brand-600 text-white ring-4 ring-brand-100"
                                : done
                                  ? "bg-brand-100 text-brand-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {done ? "✓" : i + 1}
                          </span>
                          <span className={`mt-2 max-w-[110px] text-xs font-bold ${current ? "text-brand-800" : done ? "text-brand-700" : "text-slate-500"}`}>
                            {step.label}
                          </span>
                        </div>
                        {i < flow.length - 1 && (
                          <span className={`mx-1 mb-5 h-0.5 flex-1 self-start rounded ${i < orderStatusIdx ? "bg-brand-300" : "bg-slate-200"}`} />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <BalanceBanner balance={balance} />

              <div className="mt-6 space-y-2 rounded-xl bg-slate-100 p-4">
                {order.items_text && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Items</span>
                    <strong className="text-right text-slate-800">{order.items_text}</strong>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <strong className="text-slate-800">{money.format(Number(order.total || 0))}</strong>
                </div>
                {Number(order.paid || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Abono</span>
                    <strong className="text-slate-800">{money.format(Number(order.paid))}</strong>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
                  <span className="font-extrabold text-slate-500">Saldo</span>
                  <strong className={balance > 0 ? "text-brand-700" : "text-success-700"}>
                    {balance > 0 ? money.format(balance) : "Pagado ✓"}
                  </strong>
                </div>
                {order.due_date && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Fecha prometida</span>
                    <span>{formatCustomFieldValue(order.due_date, "datetime")}</span>
                  </div>
                )}
              </div>

              {Object.keys(order.custom_fields || {}).length > 0 && (
                <CustomFieldsGrid fields={order.custom_fields} definitions={business?.custom_fields_config} />
              )}

              {balance > 0 && <PaymentSection order={order} business={business} />}

              {approval && (
                <ApprovalBox approval={approval} onDecide={() => setApproval(null)} />
              )}

              <LoyaltyWidget loyalty={loyalty} />
            </div>
          </Card>

          {/* QR panel */}
          <Card className="p-6">
            <div className="flex gap-2">
              {(["track", "pickup", "review"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setUserOverride(true);
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-extrabold transition-colors ${
                    mode === m ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>

            <p className="mt-4 text-sm text-slate-500">
              {mode === "pickup"
                ? "El operador escanea este código para confirmar la entrega."
                : mode === "review"
                  ? "Código para ver y confirmar tu entrega. ¡Gracias por confiar!"
                  : "Escanea el código para ver el estado actual de tu pedido."}
            </p>

            <div className="mt-4 flex justify-center rounded-2xl bg-white p-6">
              <QRCodeSVG value={qrPayload} size={210} fgColor="#0B6E4F" bgColor="#ffffff" level="M" />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => navigator.share?.({ title: `Tiquete #${order.order_number}`, url: buildTrackPayload(order.order_number, order.slug || business?.slug || "") }).catch(() => {})}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Compartir
              </button>
              <CopyButton
                text={buildTrackPayload(order.order_number, order.slug || business?.slug || "")}
                label="Copiar enlace"
              />
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">
              Última actualización: {order.updated_at ? new Date(order.updated_at).toLocaleString("es-CO") : "—"}
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}

function pageUrlSearch() {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

function TiqueteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function TiquetePage() {
  return (
    <Suspense fallback={<TiqueteFallback />}>
      <TiqueteInner />
    </Suspense>
  );
}