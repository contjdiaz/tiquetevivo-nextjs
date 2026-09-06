"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiPostJSON, money, normalizeOrder } from "@/lib/client";

function BuscarInner() {
  const params = useSearchParams();
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phoneError, setPhoneError] = useState("");
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [otpError, setOtpError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const slugParam = params.get("slug");
    if (slugParam) setSlug(slugParam.trim());
  }, [params]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [countdown]);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setPhoneError("");
    const result = await apiPostJSON("/api/ticket-recovery", {
      action: "request-otp",
      slug: slug.trim(),
      phone: phone.trim()
    });
    setLoading(false);

    if (result.status === 429) {
      const ra = result.data?.retry_after || 900;
      setCountdown(ra);
      setPhoneError("Demasiados intentos. Intenta de nuevo en unos minutos.");
      return;
    }
    if (!result.ok) {
      setPhoneError(result.data?.detail || result.data?.message || "No se pudo enviar el código.");
      return;
    }
    setStep("otp");
    window.setTimeout(() => codeRef.current?.focus(), 100);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const code = codeRef.current?.value.trim() || "";
    if (!code) return;
    setLoading(true);
    setOtpError("");
    const result = await apiPostJSON("/api/ticket-recovery", {
      action: "verify-otp",
      slug: slug.trim(),
      phone: phone.trim(),
      code
    });
    setLoading(false);

    if (!result.ok || !Array.isArray(result.data?.orders)) {
      const d = result.data || {};
      if (d.error === "code_expired") setOtpError("El código expiró. Pide uno nuevo.");
      else if (d.error === "code_locked") setOtpError("Código bloqueado por muchos intentos.");
      else {
        setOtpError(d.error === "invalid_code" ? "Código incorrecto." : (d.detail || "No se pudo verificar."));
        if (typeof d.remaining_attempts === "number") setRemainingAttempts(d.remaining_attempts);
      }
      return;
    }
    setOrders((result.data.orders || []).map(normalizeOrder));
    setRemainingAttempts(null);
    setDone(true);
  }

  async function handleResend() {
    if (countdown > 0) return;
    setOtpError("");
    setRemainingAttempts(null);
    const result = await apiPostJSON("/api/ticket-recovery", {
      action: "request-otp",
      slug: slug.trim(),
      phone: phone.trim()
    });
    if (result.status === 429) {
      const ra = result.data?.retry_after || 900;
      setCountdown(ra);
      setOtpError("Intenta de nuevo más tarde.");
    }
  }

  const inputCls =
    "mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-lg px-4">
        <header className="mb-6">
          <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-800">← Inicio</Link>
          <h1 className="font-display mt-3 text-3xl text-slate-900">Encuentra tu pedido</h1>
          <p className="mt-1 text-slate-600">Te enviamos un código por WhatsApp para confirmar tu número y listar tus pedidos activos.</p>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          {!done ? (
            step === "phone" ? (
              <form onSubmit={handleRequestOtp}>
                <label className="block">
                  Negocio (slug)
                  <input className={inputCls} value={slug} placeholder="majesty"
                    onChange={(e) => setSlug(e.target.value.trim())} required />
                </label>
                <label className="mt-4 block">
                  Tu WhatsApp
                  <input className={inputCls} value={phone} placeholder="+573001234567"
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} required />
                </label>
                {phoneError && <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">{phoneError}</p>}
                <button type="submit" disabled={loading || countdown > 0}
                  className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-3 font-extrabold text-white hover:bg-brand-700 disabled:opacity-60">
                  {countdown > 0 ? `Reintenta en ${countdown}s` : loading ? "Enviando…" : "Enviar código"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <p className="text-sm text-slate-600">
                  Enviamos un código de 4 dígitos a <strong>{phone}</strong> (válido por 5 min).
                </p>
                <label className="mt-4 block">
                  Código
                  <input ref={codeRef} inputMode="numeric" maxLength={4} autoFocus
                    className={inputCls + " text-center text-2xl tracking-[0.5em] font-extrabold"} placeholder="••••" />
                </label>
                {otpError && (
                  <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">
                    {otpError}
                    {remainingAttempts !== null && ` Quedan ${remainingAttempts} intento${remainingAttempts === 1 ? "" : "s"}.`}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <button type="button" disabled={countdown > 0 || loading} onClick={handleResend}
                    className="text-sm font-bold text-brand-700 hover:underline disabled:opacity-50">
                    {countdown > 0 ? `Reenviar en ${countdown}s` : "Reenviar código"}
                  </button>
                  <button type="submit" disabled={loading}
                    className="rounded-lg bg-slate-900 px-5 py-3 font-extrabold text-white hover:bg-slate-800 disabled:opacity-60">
                    {loading ? "Verificando…" : "Verificar"}
                  </button>
                </div>
                <p className="mt-4 text-center text-xs text-slate-400">
                  ¿No llegó el mensaje? Verifica que el número coincida con el del negocio y el WhatsApp tenga señal.
                </p>
              </form>
            )
          ) : orders.length === 0 ? (
            <div className="text-center">
              <span className="text-4xl">🗂️</span>
              <h2 className="mt-3 text-xl font-extrabold text-slate-900">No tienes pedidos activos</h2>
              <p className="mt-1 text-sm text-slate-600">Los pedidos entregados y cancelados se limpian automáticamente.</p>
              <button onClick={() => { setDone(false); setStep("phone"); setPhone(""); }} className="mt-4 text-sm font-bold text-brand-700 hover:underline">
                Buscar con otro número
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Tus pedidos activos</h2>
              <p className="text-sm text-slate-500">Toca uno para ver su estado en detalle.</p>
              <div className="mt-4 space-y-3">
                {orders.map((o) => (
                  <Link
                    key={o.id}
                    href={o.ticket_token
                      ? `/tiquete?ticket_token=${encodeURIComponent(o.ticket_token)}`
                      : `/tiquete?number=${encodeURIComponent(o.order_number)}&slug=${encodeURIComponent(o.slug)}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-transform hover:-translate-y-px">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-xl">🎫</span>
                    <div className="flex-1">
                      <strong className="text-slate-900">#{o.order_number}</strong>
                      <p className="text-sm text-slate-500">{o.items_text || "Pedido"}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-extrabold ${
                        o.status === "READY" ? "bg-success-50 text-success-700" : "bg-info-50 text-info-700"}`}>
                        {o.status === "READY" ? "Listo" : "En proceso"}
                      </span>
                      {Number(o.balance) > 0 && (
                        <span className="block text-sm font-bold text-brand-700">{money.format(Number(o.balance))}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              <button onClick={() => { setDone(false); setStep("phone"); }} className="mt-4 text-sm font-bold text-brand-700 hover:underline">
                Buscar otro número
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function BuscarFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function BuscarPage() {
  return (
    <Suspense fallback={<BuscarFallback />}>
      <BuscarInner />
    </Suspense>
  );
}