"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, apiPostJSON, money } from "@/lib/client";

type Phase = "loading" | "ready" | "decided" | "expired" | "invalid" | "done";

function AprobarInner() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const token = params.get("token") || "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [approval, setApproval] = useState<any>(null);
  const [decidedStatus, setDecidedStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || !token) {
      setPhase("invalid");
      return;
    }
    apiFetch(`/api/approval-decide?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 404) {
          setPhase("invalid");
          return;
        }
        if (res.status === 403) {
          setPhase("expired");
          return;
        }
        if (!res.ok) {
          setPhase("invalid");
          return;
        }
        const data = await res.json();
        if (data.already_decided) {
          setDecidedStatus(data.status);
          setPhase("decided");
          return;
        }
        setApproval(data.approval);
        setPhase("ready");
      })
      .catch(() => setPhase("invalid"));
  }, [id, token]);

  async function decide(json: any) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await apiPostJSON("/api/approval-decide", json);
    setBusy(false);
    if (!result.ok || !result.data?.success) {
      setError(result.data?.detail || result.data?.error || "No se pudo procesar.");
      return;
    }
    setDecidedStatus(result.data.status);
    setPhase("done");
  }

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-md px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          {phase === "loading" && (
            <div className="py-10 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
            </div>
          )}

          {phase === "invalid" && (
            <div className="py-10 text-center">
              <span className="text-4xl">🔎</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">Enlace no válido</h1>
              <p className="mt-2 text-sm text-slate-600">Este enlace de aprobación no existe.</p>
            </div>
          )}

          {phase === "expired" && (
            <div className="py-10 text-center">
              <span className="text-4xl">🕐</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">La solicitud expiró</h1>
              <p className="mt-2 text-sm text-slate-600">Este enlace solo es válido por un tiempo corto. Pide uno nuevo al negocio.</p>
            </div>
          )}

          {phase === "decided" && (
            <div className="py-10 text-center">
              <span className="text-4xl">{decidedStatus === "APPROVED" ? "✅" : "❌"}</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">
                {decidedStatus === "APPROVED" ? "Ya aprobaste este valor" : "Ya rechazaste este valor"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">No hace falta hacer nada más. El negocio ya fue notificado.</p>
            </div>
          )}

          {phase === "ready" && approval && (
            <div className="text-center">
              <span className="text-5xl">🗳️</span>
              <p className="mt-2 text-sm font-bold text-slate-500 uppercase tracking-wide">{approval.business_name || "Tu negocio"}</p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Valor adicional a tu pedido</h1>
              <p className="mt-2 text-sm text-slate-600">{approval.description || "Cuando un pedido supera el valor inicial, necesitamos tu visto bueno."}</p>
              <div className="mt-5 rounded-xl bg-slate-100 p-4">
                <span className="text-3xl font-extrabold text-brand-700">{money.format(Number(approval.amount || 0))}</span>
              </div>
              {error && <p className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">{error}</p>}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  disabled={busy}
                  onClick={() => decide({ action: "decide", id, token, decision: "reject" })}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3 font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Rechazar
                </button>
                <button
                  disabled={busy}
                  onClick={() => decide({ action: "decide", id, token, decision: "approve" })}
                  className="rounded-lg bg-brand-600 px-4 py-3 font-extrabold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy ? "Procesando…" : "Aprobar"}
                </button>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Si rechazas, el negocio verá la nota y te contactará.
              </p>
            </div>
          )}

          {phase === "done" && (
            <div className="py-10 text-center">
              <span className="text-5xl">{decidedStatus === "APPROVED" ? "✅" : "❌"}</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">
                {decidedStatus === "APPROVED" ? "¡Gracias por aprobar!" : "Entendido"}
              </h1>
              <p className="mt-2 text-sm text-slate-600">Tu respuesta fue registrada y notificamos al negocio.</p>
              <Link href="/buscar" className="mt-5 block text-sm font-bold text-brand-700 hover:underline">
                Ver mis pedidos
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function AprobarFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function AprobarPage() {
  return (
    <Suspense fallback={<AprobarFallback />}>
      <AprobarInner />
    </Suspense>
  );
}