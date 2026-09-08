"use client";

/**
 * PromotionsManager — Gestor de promociones del panel del Dueño fruver (R5).
 *
 * CRUD sobre la tabla `promotions` a través del endpoint existente
 * `manage-promotions` (acciones `list`, `create`, `update`, `deactivate`).
 * No crea endpoints nuevos: reutiliza el handler y su validación de servidor.
 *
 * Reglas de negocio reflejadas en la UI (validadas también en el servidor):
 *   - Ventana de vigencia: `ends_at >= starts_at` (R5.1, R5.2).
 *   - Descuento en el rango [0, 100] para combos y códigos (R5.2).
 *   - Desactivar excluye la promoción del renderizador de publicidad (R5.3).
 *   - El listado muestra estado y vigencia, filtrado por `business_id` (R5.4).
 *   - El acceso requiere `manage_business`, garantizado por el token del
 *     endpoint (R5.5); el `business_id` se envía en cada petición.
 *
 * Props: coinciden con `FruverPanelProps` de `FruverPanel.tsx`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPostJSON } from "@/lib/client";
import type { FruverPanelProps } from "./FruverPanel";
import type { Promotion, PromotionType } from "@/lib/fruver/types";

const ENDPOINT = "/api/manage-promotions";

const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  banner: "Banner",
  combo: "Combo",
  discount_code: "Código de descuento"
};

const PROMOTION_TYPE_ICONS: Record<PromotionType, string> = {
  banner: "📣",
  combo: "🧺",
  discount_code: "🏷️"
};

interface PromotionFormState {
  type: PromotionType;
  text: string;
  code: string;
  discount_percent: string;
  product_ids: string; // comma-separated ids in the form
  starts_at: string; // datetime-local value
  ends_at: string; // datetime-local value
}

const EMPTY_FORM: PromotionFormState = {
  type: "banner",
  text: "",
  code: "",
  discount_percent: "",
  product_ids: "",
  starts_at: "",
  ends_at: ""
};

/** Convierte un ISO string a valor apto para `<input type="datetime-local">`. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** Convierte el valor de `datetime-local` a ISO 8601; "" si vacío/ inválido. */
function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

/** Formatea una fecha ISO para mostrarla de forma legible. */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** Vigencia de una promoción activa respecto a `now`. */
function vigencyLabel(promo: Promotion, now: Date): { label: string; tone: string } {
  if (!promo.active) return { label: "Inactiva", tone: "bg-slate-100 text-slate-500" };
  const start = new Date(promo.starts_at).getTime();
  const end = new Date(promo.ends_at).getTime();
  const t = now.getTime();
  if (!Number.isNaN(start) && t < start) {
    return { label: "Programada", tone: "bg-amber-100 text-amber-700" };
  }
  if (!Number.isNaN(end) && t > end) {
    return { label: "Vencida", tone: "bg-slate-100 text-slate-500" };
  }
  return { label: "Vigente", tone: "bg-emerald-100 text-emerald-700" };
}

/**
 * Valida el formulario en el cliente antes de enviar (mensajes tempranos).
 * El servidor revalida con `validateWindow` / `validateDiscountPercent`.
 */
function validateForm(form: PromotionFormState): { ok: boolean; message?: string } {
  if (form.type === "banner" && !form.text.trim()) {
    return { ok: false, message: "El texto del banner es obligatorio." };
  }
  if (form.type === "discount_code" && !form.code.trim()) {
    return { ok: false, message: "El código de descuento es obligatorio." };
  }
  if (form.type === "combo") {
    const ids = form.product_ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      return { ok: false, message: "El combo requiere al menos un ID de producto." };
    }
  }

  if (!form.starts_at) return { ok: false, message: "La fecha de inicio es obligatoria." };
  if (!form.ends_at) return { ok: false, message: "La fecha de fin es obligatoria." };

  const start = new Date(form.starts_at).getTime();
  const end = new Date(form.ends_at).getTime();
  if (Number.isNaN(start)) return { ok: false, message: "La fecha de inicio no es válida." };
  if (Number.isNaN(end)) return { ok: false, message: "La fecha de fin no es válida." };
  if (end < start) {
    return { ok: false, message: "La fecha de fin no puede ser anterior a la de inicio." };
  }

  const needsDiscount = form.type === "combo" || form.type === "discount_code";
  const hasDiscount = form.discount_percent.trim() !== "";
  if (needsDiscount && !hasDiscount) {
    return { ok: false, message: "El porcentaje de descuento es obligatorio para combos y códigos." };
  }
  if (hasDiscount) {
    const pct = Number(form.discount_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, message: "El descuento debe estar entre 0 y 100." };
    }
  }

  return { ok: true };
}

/** Construye el objeto `promotion` esperado por `manage-promotions`. */
function buildPromotionPayload(form: PromotionFormState) {
  const hasDiscount = form.discount_percent.trim() !== "";
  return {
    type: form.type,
    text: form.type === "banner" ? form.text.trim() : form.text.trim() || null,
    code: form.type === "discount_code" ? form.code.trim() : form.code.trim() || null,
    discount_percent: hasDiscount ? Number(form.discount_percent) : null,
    product_ids:
      form.type === "combo"
        ? form.product_ids
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    starts_at: localInputToIso(form.starts_at),
    ends_at: localInputToIso(form.ends_at)
  };
}

export default function PromotionsManager({ businessId, businessName, toastFn }: FruverPanelProps) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [form, setForm] = useState<PromotionFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), [promotions]);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await apiPostJSON(ENDPOINT, { action: "list", business_id: businessId });
    setLoading(false);
    if (!res.ok) {
      const message =
        res.status === 401 || res.status === 403
          ? "No tienes permiso para gestionar las promociones de este negocio."
          : res.data?.message || "No se pudieron cargar las promociones.";
      setError(message);
      return;
    }
    const list: Promotion[] = Array.isArray(res.data?.promotions) ? res.data.promotions : [];
    setPromotions(list);
  }, [businessId]);

  useEffect(() => {
    void loadPromotions();
  }, [loadPromotions]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
  }

  function startEdit(promo: Promotion) {
    setEditingId(promo.id);
    setFormError("");
    setForm({
      type: promo.type,
      text: promo.text ?? "",
      code: promo.code ?? "",
      discount_percent: promo.discount_percent != null ? String(promo.discount_percent) : "",
      product_ids: Array.isArray(promo.product_ids) ? promo.product_ids.join(", ") : "",
      starts_at: isoToLocalInput(promo.starts_at),
      ends_at: isoToLocalInput(promo.ends_at)
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateForm(form);
    if (!check.ok) {
      setFormError(check.message || "Revisa los datos del formulario.");
      return;
    }
    setFormError("");
    setSaving(true);

    const promotion = buildPromotionPayload(form);
    const body = editingId
      ? { action: "update", business_id: businessId, promotion_id: editingId, promotion }
      : { action: "create", business_id: businessId, promotion };

    const res = await apiPostJSON(ENDPOINT, body);
    setSaving(false);

    if (!res.ok) {
      const message = res.data?.message || "No se pudo guardar la promoción.";
      setFormError(message);
      toastFn(message);
      return;
    }

    toastFn(editingId ? "Promoción actualizada." : "Promoción creada.");
    resetForm();
    await loadPromotions();
  }

  async function handleDeactivate(promo: Promotion) {
    if (!promo.active) return;
    const confirmed = window.confirm(
      `¿Desactivar esta promoción? Dejará de mostrarse en la publicidad de ${businessName}.`
    );
    if (!confirmed) return;

    setBusyId(promo.id);
    const res = await apiPostJSON(ENDPOINT, {
      action: "deactivate",
      business_id: businessId,
      promotion_id: promo.id
    });
    setBusyId(null);

    if (!res.ok) {
      toastFn(res.data?.message || "No se pudo desactivar la promoción.");
      return;
    }
    toastFn("Promoción desactivada.");
    await loadPromotions();
  }

  const needsDiscount = form.type === "combo" || form.type === "discount_code";

  return (
    <div className="flex flex-col gap-6">
      {/* Formulario de creación / edición */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-label={editingId ? "Editar promoción" : "Crear promoción"}
      >
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-base font-extrabold text-slate-900">
            {editingId ? "Editar promoción" : "Nueva promoción"}
          </strong>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm font-bold text-slate-500 hover:text-slate-700"
            >
              Cancelar edición
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            Tipo
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PromotionType }))}
              disabled={Boolean(editingId)}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100"
            >
              {(Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[]).map((t) => (
                <option key={t} value={t}>
                  {PROMOTION_TYPE_ICONS[t]} {PROMOTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          {form.type === "banner" && (
            <label className="flex flex-col gap-1 text-sm font-bold text-slate-700 md:col-span-2">
              Texto del banner
              <input
                type="text"
                value={form.text}
                onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="Ej. ¡Frutas frescas esta semana!"
                className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          )}

          {form.type === "discount_code" && (
            <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
              Código
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ej. FRUVER10"
                className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal uppercase text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          )}

          {form.type === "combo" && (
            <label className="flex flex-col gap-1 text-sm font-bold text-slate-700 md:col-span-2">
              IDs de productos del combo (separados por coma)
              <input
                type="text"
                value={form.product_ids}
                onChange={(e) => setForm((f) => ({ ...f, product_ids: e.target.value }))}
                placeholder="id-1, id-2, id-3"
                className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          )}

          {(needsDiscount || form.discount_percent) && (
            <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
              Descuento (%){needsDiscount ? "" : " (opcional)"}
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.discount_percent}
                onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))}
                placeholder="0 - 100"
                className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            Inicio de vigencia
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            Fin de vigencia
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </label>
        </div>

        {formError && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {formError}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60"
          >
            {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear promoción"}
          </button>
        </div>
      </form>

      {/* Listado de promociones */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-base font-extrabold text-slate-900">Promociones</strong>
          <button
            type="button"
            onClick={() => void loadPromotions()}
            className="text-sm font-bold text-brand-600 hover:text-brand-700"
          >
            ↻ Actualizar
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-8 text-sm font-bold text-slate-500">
            Cargando promociones…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-rose-50 px-3 py-4 text-center text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : promotions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center">
            <p className="text-sm font-bold text-slate-600">Aún no hay promociones.</p>
            <p className="mt-1 text-xs text-slate-500">Crea un banner, combo o código de descuento arriba.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {promotions.map((promo) => {
              const vigency = vigencyLabel(promo, now);
              return (
                <li
                  key={promo.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900">
                        <span aria-hidden="true">{PROMOTION_TYPE_ICONS[promo.type]}</span>{" "}
                        {PROMOTION_TYPE_LABELS[promo.type]}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${vigency.tone}`}>
                        {vigency.label}
                      </span>
                      {promo.discount_percent != null && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                          −{promo.discount_percent}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">
                      {promo.type === "banner" && (promo.text || "Sin texto")}
                      {promo.type === "discount_code" && `Código: ${promo.code || "—"}`}
                      {promo.type === "combo" &&
                        `${Array.isArray(promo.product_ids) ? promo.product_ids.length : 0} producto(s)`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDate(promo.starts_at)} → {formatDate(promo.ends_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(promo)}
                      className="min-h-[40px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    >
                      Editar
                    </button>
                    {promo.active && (
                      <button
                        type="button"
                        onClick={() => void handleDeactivate(promo)}
                        disabled={busyId === promo.id}
                        className="min-h-[40px] rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-60"
                      >
                        {busyId === promo.id ? "…" : "Desactivar"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
