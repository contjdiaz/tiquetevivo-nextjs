"use client";

import { useMemo, useState } from "react";
import { computeEstimatedTotal } from "@/lib/vertical/quote-calculator";
import { getVerticalTheme, normalizeHex, readableTextColor } from "@/lib/vertical/brand";
import { DEFAULT_BRAND_COLOR } from "@/lib/lavanderia/brand";
import { unitLabel, type PublicService, type ServiceQuoteLine } from "@/lib/lavanderia/types";
import type { PublicPromotionAny } from "@/lib/fruver/sanitize";
import type { AdvertisingBlocks } from "@/lib/fruver/advertising";
import AdvertisingSection from "@/components/vertical/AdvertisingSection";

interface PublicBusiness {
  slug: string;
  name: string;
  color: string | null;
  logo_url: string | null;
}

interface ServiceQuoteBuilderProps {
  slug: string;
  business: PublicBusiness;
  services: PublicService[];
  promotions: PublicPromotionAny[];
  advertising?: AdvertisingBlocks;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

/** Normaliza dígitos de teléfono igual que el servidor (`validatePhone`). */
function normalizeDigits(value: string): string {
  return value.replace(/[+\s\-]/g, "");
}

/** Valida el teléfono opcional: 10–15 dígitos cuando se ingresa. */
function phoneValidationError(phone: string): string | null {
  if (phone.trim() === "") return null;
  const digits = normalizeDigits(phone);
  if (!/^\d+$/.test(digits)) {
    return "Usa solo dígitos (se permiten +, espacios o guiones).";
  }
  if (digits.length < 10 || digits.length > 15) {
    return "El WhatsApp debe tener entre 10 y 15 dígitos.";
  }
  return null;
}

/** Valida el nombre opcional: al menos 2 caracteres cuando se ingresa. */
function nameValidationError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return null;
  if (trimmed.length < 2) return "El nombre debe tener al menos 2 caracteres.";
  return null;
}

/** Lead time label from the service duration (minutes). */
function leadTimeLabel(duration: number | null): string | null {
  if (duration == null) return null;
  const minutes = Math.max(1, Math.round(duration));
  if (minutes < 60) return `Listo en ~${minutes} min`;
  const hours = minutes / 60;
  if (hours >= 24) return "Listo el mismo día";
  return `Listo en ~${hours % 1 === 0 ? hours : hours.toFixed(1)} h`;
}

// ─── Quantity Stepper ───────────────────────────────────────────────────────

function QuantityStepper({
  value,
  onChange,
  invalid,
  serviceName,
  unitLabelText
}: {
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  serviceName: string;
  unitLabelText: string;
}) {
  function step(delta: number) {
    const current = parseFloat(value) || 0;
    const next = Math.max(0, current + delta);
    onChange(next === 0 ? "" : String(next));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={`flex items-center overflow-hidden rounded-xl border ${
          invalid ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
        }`}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={`Reducir cantidad de ${serviceName}`}
          className="flex h-11 w-11 items-center justify-center text-lg text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
        >
          −
        </button>
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          aria-label={`Cantidad de ${serviceName} ${unitLabelText}`}
          aria-invalid={invalid}
          className="h-11 w-16 bg-transparent py-1 text-center text-sm font-bold text-slate-800 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
        />
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`Aumentar cantidad de ${serviceName}`}
          className="flex h-11 w-11 items-center justify-center text-lg text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
        >
          ＋
        </button>
      </div>
      {invalid && (
        <span className="text-[10px] font-semibold text-red-500">Cantidad inválida</span>
      )}
    </div>
  );
}

// ─── Service Card ───────────────────────────────────────────────────────────

function ServiceCard({
  service,
  qty,
  onQtyChange
}: {
  service: PublicService;
  qty: string;
  onQtyChange: (v: string) => void;
}) {
  const isFixedRate = service.unit === "flat_rate";
  const invalid =
    !isFixedRate &&
    qty != null &&
    qty.trim() !== "" &&
    (!Number.isFinite(Number(qty)) || Number(qty) <= 0);
  const parsedQty = parseFloat(qty);
  const subtotal = !invalid && parsedQty > 0 ? service.price * parsedQty : null;
  const leadTime = leadTimeLabel(service.duration);

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border bg-white p-3 shadow-sm transition ${
        subtotal !== null
          ? "border-[var(--brand-primary-border)] shadow-[var(--brand-primary-soft)]"
          : "border-slate-100"
      }`}
    >
      <div aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-primary-soft)] text-lg">
        🧺
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-slate-800">{service.name}</span>
          {leadTime && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
              ⏱ {leadTime}
            </span>
          )}
        </div>
        {service.description && (
          <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{service.description}</p>
        )}
        <p className="mt-1 text-sm font-semibold text-[var(--brand-primary)]">
          {formatMoney(service.price)}{" "}
          <span className="font-normal text-slate-400">/ {unitLabel(service.unit)}</span>
        </p>
        {subtotal !== null && (
          <p className="mt-0.5 text-xs font-extrabold text-[var(--brand-primary-strong)]">
            Subtotal: {formatMoney(subtotal)}
          </p>
        )}
      </div>

      {isFixedRate ? (
        <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
          Tarifa fija
        </span>
      ) : (
        <QuantityStepper
          value={qty ?? ""}
          onChange={onQtyChange}
          invalid={invalid}
          serviceName={service.name}
          unitLabelText={unitLabel(service.unit)}
        />
      )}
    </div>
  );
}

// ─── Main ServiceQuoteBuilder ───────────────────────────────────────────────

/**
 * Client island for the public lavanderia service quoter.
 *
 * Manages per-service quantities (kilos for `per_kg`, prendas for `per_item`,
 * horas for `per_hour`; `flat_rate` services are fixed at one unit), validates
 * that each quantity is numeric and `> 0`, and recomputes the Total_Estimado
 * LOCALLY with the shared pure calculator (no server round-trips). Sending the
 * quote posts to /api/submit-quote, which recalculates the total
 * authoritatively against the business' `services_config`.
 */
export default function ServiceQuoteBuilder({
  slug,
  business,
  services,
  promotions,
  advertising
}: ServiceQuoteBuilderProps) {
  // serviceId -> raw quantity string (kept as string to validate input).
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  // Client-side search query for filtering the services by name.
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; fallbackLink: string | null; sent: boolean }
    | { ok: false; message: string }
    | null
  >(null);

  // Normalize the business brand color and pick an accessible text color so
  // primary surfaces (hero, action button) keep AA contrast (R1.3, R1.4).
  const brandColor = normalizeHex(business.color) ?? DEFAULT_BRAND_COLOR;
  const brandTextColor = readableTextColor(brandColor);
  const theme = getVerticalTheme(business.color, DEFAULT_BRAND_COLOR);

  const phoneError = phoneValidationError(phone);
  const nameError = nameValidationError(name);
  const hasContactErrors = Boolean(phoneError || nameError);

  // Build valid quote lines from current quantities (qty numeric and > 0).
  const lines: ServiceQuoteLine[] = useMemo(() => {
    const out: ServiceQuoteLine[] = [];
    for (const s of services) {
      if (s.unit === "flat_rate") {
        out.push({
          service_id: s.id,
          name: s.name,
          unit: s.unit,
          day_price: s.price,
          qty: 1
        });
        continue;
      }
      const raw = quantities[s.id];
      if (raw == null || raw.trim() === "") continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      out.push({
        service_id: s.id,
        name: s.name,
        unit: s.unit,
        day_price: s.price,
        qty
      });
    }
    return out;
  }, [services, quantities]);

  // Local Total_Estimado — recomputed on every change, no round-trip (R5.3).
  const estimatedTotal = useMemo(() => computeEstimatedTotal(lines), [lines]);

  // Services filtered by the search query (case/accent-insensitive).
  const visibleServices = useMemo(() => {
    const q = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!q) return services;
    return services.filter((s) =>
      s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q)
    );
  }, [services, search]);

  function setQty(serviceId: string, value: string) {
    setQuantities((prev) => ({ ...prev, [serviceId]: value }));
  }

  async function submitQuote() {
    if (lines.length === 0 || hasContactErrors) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/submit-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          lines: lines.map((l) => ({ service_id: l.service_id, qty: l.qty }))
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setResult({ ok: false, message: data.message || "No se pudo enviar la cotización" });
      } else {
        setResult({ ok: true, fallbackLink: data.fallback_link || null, sent: Boolean(data.whatsapp_sent) });
        if (!data.whatsapp_sent && data.fallback_link) {
          window.open(data.fallback_link, "_blank");
        }
      }
    } catch (err: any) {
      setResult({ ok: false, message: err.message || "Error de red" });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCount = lines.length;

  return (
    <main
      className="min-h-screen bg-slate-50 pb-[calc(10rem+env(safe-area-inset-bottom))] [--brand-primary-soft:color-mix(in_srgb,var(--brand-primary)_10%,white)] [--brand-primary-border:color-mix(in_srgb,var(--brand-primary)_30%,white)]"
      style={theme}
    >
      {/* ── Hero Header ───────────────────────────────────────── */}
      <header
        className="relative overflow-hidden px-6 py-8"
        style={{ backgroundColor: brandColor, color: brandTextColor }}
      >
        <span
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-10"
          style={{ backgroundColor: brandTextColor }}
        />
        <span
          className="pointer-events-none absolute -bottom-6 left-1/3 h-24 w-24 rounded-full opacity-10"
          style={{ backgroundColor: brandTextColor }}
        />

        <div className="relative mx-auto flex max-w-2xl items-center gap-4">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              className="h-16 w-16 shrink-0 rounded-2xl border border-white/50 bg-white object-contain p-1 shadow-lg sm:h-20 sm:w-20"
            />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-white/30 bg-white/20 text-3xl shadow-lg">
              🧺
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold leading-tight">{business.name}</h1>
            <p className="mt-0.5 text-sm font-medium opacity-85">
              Cotiza tus servicios · Cuida lo que más valoras
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        <AdvertisingSection advertising={advertising} promotions={promotions} brandColor={brandColor} />

        {/* ── Estimated total notice ─────────────────────────────── */}
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm">
          <span className="mt-0.5 text-base">⚠️</span>
          <p className="text-xs leading-relaxed text-amber-700">
            El total es <strong>estimado</strong>. El valor final lo confirma el negocio según
            el peso real y las prendas recibidas.
          </p>
        </div>

        {/* ── Service list ───────────────────────────────────────── */}
        <section className="mt-5 space-y-2">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Servicios disponibles
          </h2>

          {services.length > 0 && (
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary-soft)]">
              <span className="text-lg" aria-hidden="true">🔍</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar servicio…"
                aria-label="Buscar servicio por nombre"
                className="h-6 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {search.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="grid h-10 w-10 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus)]"
                >
                  ✕
                </button>
              )}
            </label>
          )}

          {services.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center shadow-sm">
              <span className="text-4xl" aria-hidden="true">🧺</span>
              <p className="mt-3 text-sm font-bold text-slate-700">
                Aún no hay servicios publicados
              </p>
              <p className="mt-1 text-sm text-slate-500">
                El negocio está preparando su lista de servicios. Vuelve pronto para cotizar.
              </p>
            </div>
          ) : visibleServices.length > 0 ? (
            visibleServices.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                qty={quantities[s.id] ?? ""}
                onQtyChange={(v) => setQty(s.id, v)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-8 text-center shadow-sm">
              <span className="text-3xl" aria-hidden="true">🔎</span>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                No encontramos servicios que coincidan con “{search.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Ver todos los servicios
              </button>
            </div>
          )}
        </section>

        {/* ── Customer details ───────────────────────────────────── */}
        <section className="mt-6 space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Tus datos (opcionales)
          </h2>
          <div className="space-y-3">
            <label className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm focus-within:ring-2 ${
              nameError
                ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-200"
                : "border-slate-200 focus-within:border-[var(--brand-primary)] focus-within:ring-[var(--brand-primary-soft)]"
            }`}>
              <span className="text-lg" aria-hidden="true">👤</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                aria-label="Tu nombre"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "name-error" : undefined}
                className="h-6 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            {nameError && (
              <p id="name-error" role="alert" className="mt-0.5 px-2 text-xs font-semibold text-red-500">
                {nameError}
              </p>
            )}
            <label className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm focus-within:ring-2 ${
              phoneError
                ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-200"
                : "border-slate-200 focus-within:border-[var(--brand-primary)] focus-within:ring-[var(--brand-primary-soft)]"
            }`}>
              <span className="text-lg" aria-hidden="true">📱</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Tu WhatsApp"
                aria-label="Tu número de WhatsApp"
                aria-invalid={Boolean(phoneError)}
                aria-describedby={phoneError ? "phone-error" : undefined}
                className="h-6 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            {phoneError && (
              <p id="phone-error" role="alert" className="mt-0.5 px-2 text-xs font-semibold text-red-500">
                {phoneError}
              </p>
            )}
          </div>
        </section>

        {/* ── Result messages ────────────────────────────────────── */}
        {result && result.ok === false && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
            <span className="text-base">❌</span>
            <p className="text-sm text-red-700">{result.message}</p>
          </div>
        )}
        {result && result.ok === true && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <span className="text-base">✅</span>
            <p className="text-sm font-semibold text-emerald-700">
              {result.sent
                ? "¡Cotización enviada! El negocio te confirmará peso final y precio."
                : "Abrimos WhatsApp para que envíes tu cotización al negocio."}
            </p>
          </div>
        )}
      </div>

      {/* ── Persistent summary + send bar ────────────────────────── */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur"
        role="region"
        aria-label="Resumen de tu cotización"
      >
        <div className="mx-auto max-w-2xl">
          <p className="mb-1.5 text-center text-[11px] leading-tight text-slate-400">
            Total <strong className="font-semibold text-slate-500">estimado</strong> · lo confirma el negocio
          </p>
          <div className="flex flex-col items-stretch gap-3 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
            <div aria-live="polite">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Total estimado
              </span>
              <span className="text-2xl font-extrabold text-slate-900">
                {formatMoney(estimatedTotal)}
              </span>
              <span className="ml-2 text-xs text-slate-400">
                {selectedCount > 0
                  ? `· ${selectedCount} ${selectedCount === 1 ? "servicio" : "servicios"}`
                  : "· agrega servicios"}
              </span>
            </div>
            <button
              type="button"
              onClick={submitQuote}
              disabled={submitting || lines.length === 0 || hasContactErrors}
              aria-label={
                lines.length === 0
                  ? "Enviar cotización (agrega al menos un servicio)"
                  : hasContactErrors
                  ? "Enviar cotización (revisa tus datos)"
                  : "Enviar cotización"
              }
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold shadow-lg transition hover:opacity-90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-40 min-[430px]:w-auto"
              style={{ backgroundColor: brandColor, color: brandTextColor }}
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Enviando…
                </>
              ) : (
                <>
                  <span className="text-base" aria-hidden="true">📲</span>
                  Enviar cotización
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}