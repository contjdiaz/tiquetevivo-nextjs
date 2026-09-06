"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, apiPostJSON, compressImage, money } from "@/lib/client";

type State = "loading" | "valid" | "expired" | "already-delivered" | "not-found" | "error" | "success";

function EntregaInner() {
  const params = useSearchParams();
  const orderId = params.get("order_id") || "";
  const token = params.get("token") || "";

  const [state, setState] = useState<State>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [photoError, setPhotoError] = useState("");
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const capturedPhoto = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId || !token) {
      setErrorMessage("Enlace de entrega incompleto. Faltan parámetros.");
      setState("error");
      return;
    }
    validateToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, token]);

  async function validateToken() {
    setState("loading");
    try {
      const res = await apiFetch(`/api/delivery-confirm?order_id=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`);
      if (res.status === 403) {
        setState("expired");
        return;
      }
      if (res.status === 404) {
        setErrorMessage("Enlace de entrega no válido. Verifica con el operador.");
        setState("not-found");
        return;
      }
      if (!res.ok) {
        setErrorMessage("No se pudo cargar la información. Verifica el enlace e intenta de nuevo.");
        setState("error");
        return;
      }
      const data = await res.json();
      if (data.already_delivered) {
        setState("already-delivered");
        return;
      }
      setOrder(data.order || data);
      setState("valid");
    } catch {
      setErrorMessage("Error de conexión. Verifica tu internet e intenta de nuevo.");
      setState("error");
    }
  }

  async function handleConfirmPhoto(file?: File) {
    if (!file) return;
    setPhotoError("");
    setUploading(true);
    try {
      const base64 = await compressImage(file, 800, 0.8);
      capturedPhoto.current = base64;
      await confirmDelivery(base64);
    } catch (err: any) {
      setPhotoError(err.message || "Error al procesar la foto.");
      setUploading(false);
    } finally {
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function confirmDelivery(base64: string) {
    setUploading(true);
    try {
      const result = await apiPostJSON("/api/delivery-confirm", {
        action: "confirm",
        order_id: orderId,
        token,
        photo: base64
      });
      setUploading(false);
      if (result.ok && result.data?.success) {
        capturedPhoto.current = null;
        setState("success");
        return;
      }
      const msg = result.data?.detail || result.data?.message || result.data?.error || "Error al confirmar la entrega.";
      setPhotoError(msg);
    } catch {
      setUploading(false);
      setPhotoError("Error de conexión. Intenta de nuevo.");
    }
  }

  const balance = Number(order?.balance ?? 0);

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="mx-auto max-w-lg px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          {state === "loading" && (
            <div className="py-10 text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
              <p className="mt-4 font-bold text-slate-600">Validando enlace…</p>
            </div>
          )}

          {state === "expired" && (
            <div className="py-10 text-center">
              <span className="text-4xl">🕐</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">Enlace expirado</h1>
              <p className="mt-2 text-sm text-slate-600">Este enlace de entrega venció. Pide uno nuevo en el panel.</p>
            </div>
          )}

          {state === "already-delivered" && (
            <div className="py-10 text-center">
              <span className="text-4xl">✅</span>
              <h1 className="mt-3 text-xl font-extrabold text-success-700">Ya registramos la entrega</h1>
              <p className="mt-2 text-sm text-slate-600">Este pedido ya fue marcado como entregado. ¡Gracias!</p>
            </div>
          )}

          {(state === "not-found" || state === "error") && (
            <div className="py-10 text-center">
              <span className="text-4xl">⚠️</span>
              <h1 className="mt-3 text-xl font-extrabold text-slate-900">No se pudo validar</h1>
              <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
              <button onClick={validateToken} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800">
                Reintentar
              </button>
            </div>
          )}

          {state === "success" && (
            <div className="py-10 text-center">
              <span className="text-6xl">✅</span>
              <h1 className="mt-4 text-2xl font-extrabold text-success-700">¡Entrega confirmada!</h1>
              <p className="mt-2 text-sm text-slate-600">El cliente ya fue notificado. El pedido queda completo.</p>
            </div>
          )}

          {state === "valid" && order && (
            <div>
              <div className="text-center">
                <span className="text-5xl">📦</span>
                <h1 className="mt-3 text-2xl font-extrabold text-slate-900">Confirmar entrega</h1>
                <p className="mt-1 text-sm text-slate-500">Toma una foto de las prendas entregadas.</p>
              </div>

              <div className="mt-6 space-y-3 rounded-xl bg-slate-100 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Cliente</span>
                  <strong className="text-slate-800">{order.customer_name || "—"}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Dirección</span>
                  <strong className="text-slate-800">{order.delivery_address || "Dirección no disponible"}</strong>
                </div>
                {order.items_text && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Ítems</span>
                    <strong className="text-slate-800">{order.items_text}</strong>
                  </div>
                )}
              </div>

              <div className={`mt-4 rounded-xl p-4 ${balance > 0 ? "bg-warning-50" : "bg-success-50"}`}>
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  {balance > 0 ? "Cobro pendiente" : "Sin cobro pendiente"}
                </span>
                {balance > 0 && (
                  <div className="mt-1">
                    <span className="text-2xl font-extrabold text-warning-700">{money.format(balance)}</span>
                  </div>
                )}
              </div>

              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleConfirmPhoto(e.target.files?.[0])}
              />

              {photoError && (
                <div className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">{photoError}</div>
              )}

              <button
                disabled={uploading}
                onClick={() => {
                  setPhotoError("");
                  if (capturedPhoto.current) {
                    confirmDelivery(capturedPhoto.current);
                    return;
                  }
                  photoInput.current?.click();
                }}
                className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-4 text-lg font-extrabold text-white shadow-card hover:bg-brand-700 disabled:opacity-60"
              >
                {uploading ? "Subiendo y confirmando…" : capturedPhoto.current ? "Reintentar confirmación" : "📷 Tomar foto"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function EntregaFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function EntregaPage() {
  return (
    <Suspense fallback={<EntregaFallback />}>
      <EntregaInner />
    </Suspense>
  );
}