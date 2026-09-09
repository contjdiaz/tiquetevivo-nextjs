"use client";

import { useMemo, useState } from "react";
import { computeEstimatedTotal } from "@/lib/fruver/quote-calculator";
import { filterProducts } from "@/lib/fruver/search";
import {
  DEFAULT_BRAND_COLOR,
  normalizeHex,
  readableTextColor
} from "@/lib/fruver/brand";
import { getFruverTheme } from "@/components/fruver/FruverPageShell";
import type { PublicProduct, QuoteLine } from "@/lib/fruver/types";
import type { PublicPromotionAny } from "@/lib/fruver/sanitize";
import type { AdvertisingBlocks } from "@/lib/fruver/advertising";
import AdvertisingSection from "./AdvertisingSection";

interface PublicBusiness {
  slug: string;
  name: string;
  color: string | null;
  logo_url: string | null;
}

interface QuoteBuilderProps {
  slug: string;
  business: PublicBusiness;
  products: PublicProduct[];
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

// ─── Quantity Stepper ───────────────────────────────────────────────────────

function QuantityStepper({
  value,
  onChange,
  invalid,
  productName,
  unit
}: {
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
  productName: string;
  unit: string;
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
          aria-label={`Reducir cantidad de ${productName}`}
          className="flex h-11 w-11 items-center justify-center text-lg text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
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
          aria-label={`Cantidad de ${productName} en ${unit}`}
          aria-invalid={invalid}
          className="h-11 w-16 bg-transparent py-1 text-center text-sm font-bold text-slate-800 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
        />
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`Aumentar cantidad de ${productName}`}
          className="flex h-11 w-11 items-center justify-center text-lg text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
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

// ─── Product Card ───────────────────────────────────────────────────────────

function ProductCard({
  product,
  qty,
  onQtyChange
}: {
  product: PublicProduct;
  qty: string;
  onQtyChange: (v: string) => void;
}) {
  const invalid =
    qty != null && qty.trim() !== "" && (!Number.isFinite(Number(qty)) || Number(qty) <= 0);
  const parsedQty = parseFloat(qty);
  const subtotal =
    !invalid && parsedQty > 0 ? product.day_price * parsedQty : null;

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm transition ${
        product.is_seasonal
          ? "border-orange-200 ring-1 ring-orange-100"
          : subtotal !== null
          ? "border-[var(--fruver-primary-border)] shadow-[var(--fruver-primary-soft)]"
          : "border-slate-100"
      }`}
    >
      {/* Photo or emoji */}
      {product.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.photo_url}
          alt={product.name}
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-2xl ${
            product.is_seasonal ? "bg-orange-50" : "bg-emerald-50"
          }`}
        >
          {product.is_seasonal ? "🌿" : "🥬"}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-slate-800">{product.name}</span>
          {product.is_seasonal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-orange-700">
              🌿 Temporada
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-[var(--fruver-primary)]">
          {formatMoney(product.day_price)} <span className="text-slate-400 font-normal">/ {product.unit}</span>
        </p>
        {subtotal !== null && (
          <p className="mt-0.5 text-xs font-extrabold text-[var(--fruver-primary-strong,var(--fruver-primary))]">
            Subtotal: {formatMoney(subtotal)}
          </p>
        )}
      </div>

      {/* Stepper */}
      <QuantityStepper
        value={qty ?? ""}
        onChange={onQtyChange}
        invalid={invalid}
        productName={product.name}
        unit={product.unit}
      />
    </div>
  );
}

// ─── Main QuoteBuilder ──────────────────────────────────────────────────────

/**
 * Client island for the public fruver catalog (R5.2–R5.5, R11.2).
 *
 * Manages per-product quantities, validates that each quantity is numeric and
 * `> 0`, and recomputes the Total_Estimado LOCALLY with the shared pure
 * calculator (no server round-trips). Sending the quote posts to
 * /api/submit-quote, which recalculates the total authoritatively.
 */
export default function QuoteBuilder({
  slug,
  business,
  products,
  promotions,
  advertising
}: QuoteBuilderProps) {
  // productId -> raw quantity string (kept as string to validate input).
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  // Client-side search query for filtering the catalog by name (R2.1).
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

  // Validación en vivo de los datos del cliente (opcionales pero consistentes
  // con las reglas del servidor `validatePhone`).
  const phoneError = phoneValidationError(phone);
  const nameError = nameValidationError(name);
  const hasContactErrors = Boolean(phoneError || nameError);

  // Build valid quote lines from current quantities (qty numeric and > 0).
  const lines: QuoteLine[] = useMemo(() => {
    const out: QuoteLine[] = [];
    for (const p of products) {
      const raw = quantities[p.id];
      if (raw == null || raw.trim() === "") continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      out.push({
        product_id: p.id,
        name: p.name,
        unit: p.unit as QuoteLine["unit"],
        day_price: p.day_price,
        qty
      });
    }
    return out;
  }, [products, quantities]);

  // Local Total_Estimado — recomputed on every change, no round-trip (R5.3, R11.2).
  const estimatedTotal = useMemo(() => computeEstimatedTotal(lines), [lines]);

  // Catalog filtered by the search query (case/accent-insensitive, R2.1).
  const visibleProducts = useMemo(
    () => filterProducts(products, search),
    [products, search]
  );

  function setQty(productId: string, value: string) {
    setQuantities((prev) => ({ ...prev, [productId]: value }));
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
          lines: lines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
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
      className="min-h-screen bg-slate-50 pb-[calc(10rem+env(safe-area-inset-bottom))] [--fruver-primary-soft:color-mix(in_srgb,var(--fruver-primary)_10%,white)] [--fruver-primary-border:color-mix(in_srgb,var(--fruver-primary)_30%,white)]"
      style={getFruverTheme(business.color)}
    >

      {/* ── Hero Header ───────────────────────────────────────── */}
      <header
        className="relative overflow-hidden px-6 py-8"
        style={{ backgroundColor: brandColor, color: brandTextColor }}
      >
        {/* Decorative circles — tinted with the readable text color so they
            stay subtly visible on both light and dark brand backgrounds. */}
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
              🛒
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold leading-tight">{business.name}</h1>
            <p className="mt-0.5 text-sm font-medium opacity-85">
              Arma tu pedido · Precios del día
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">

        {/* ── Advertising blocks (R4) ──────────────────────────── */}
        <AdvertisingSection advertising={advertising} promotions={promotions} brandColor={brandColor} />

        {/* ── Estimated total notice (R5.5) ────────────────────── */}
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm">
          <span className="mt-0.5 text-base">⚠️</span>
          <p className="text-xs leading-relaxed text-amber-700">
            El total es <strong>estimado</strong> con los precios del día. El valor final lo confirma
            el negocio según disponibilidad y peso real.
          </p>
        </div>

        {/* ── Product list ─────────────────────────────────────── */}
        <section className="mt-5 space-y-2">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Catálogo de hoy
          </h2>

          {/* Search bar — filters the catalog by name (R2.1). Hidden when the
              catalog itself is empty since there is nothing to search. */}
          {products.length > 0 && (
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-[var(--fruver-primary)] focus-within:ring-2 focus-within:ring-[var(--fruver-primary-soft)]">
              <span className="text-lg" aria-hidden="true">🔍</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto…"
                aria-label="Buscar producto por nombre"
                className="h-6 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              {search.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="grid h-10 w-10 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fruver-focus)]"
                >
                  ✕
                </button>
              )}
            </label>
          )}

          {products.length === 0 ? (
            /* Empty catalog state — no products published yet (R2.5). */
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-10 text-center shadow-sm">
              <span className="text-4xl" aria-hidden="true">🧺</span>
              <p className="mt-3 text-sm font-bold text-slate-700">
                Aún no hay productos publicados
              </p>
              <p className="mt-1 text-sm text-slate-500">
                El negocio está preparando el catálogo de hoy. Vuelve pronto para armar tu pedido.
              </p>
            </div>
          ) : visibleProducts.length > 0 ? (
            visibleProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                qty={quantities[p.id] ?? ""}
                onQtyChange={(v) => setQty(p.id, v)}
              />
            ))
          ) : (
            /* No results for the current search (R2.5). */
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-8 text-center shadow-sm">
              <span className="text-3xl" aria-hidden="true">🔎</span>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                No encontramos productos que coincidan con “{search.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                Ver todo el catálogo
              </button>
            </div>
          )}
        </section>

        {/* ── Customer details ─────────────────────────────────── */}
        <section className="mt-6 space-y-3">
          <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Tus datos (opcionales)
          </h2>
          <div className="space-y-3">
            <label className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm focus-within:ring-2 ${
              nameError
                ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-200"
                : "border-slate-200 focus-within:border-[var(--fruver-primary)] focus-within:ring-[var(--fruver-primary-soft)]"
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
                : "border-slate-200 focus-within:border-[var(--fruver-primary)] focus-within:ring-[var(--fruver-primary-soft)]"
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

        {/* ── Result messages ──────────────────────────────────── */}
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
                ? "¡Cotización enviada! El negocio te confirmará disponibilidad y precio final."
                : "Abrimos WhatsApp para que envíes tu cotización al negocio."}
            </p>
          </div>
        )}
      </div>

      {/* ── Persistent summary + send bar (R2.4, R2.6, R2.8) ─────────
          Stays fixed at the bottom so the running item count, Total_Estimado
          and the clear CTA are always reachable without obstructing content
          (the main region reserves bottom padding). */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur"
        role="region"
        aria-label="Resumen de tu cotización"
      >
        <div className="mx-auto max-w-2xl">
          {/* Estimated-total reminder kept visible with the summary (R2.8). */}
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
                  ? `· ${selectedCount} ${selectedCount === 1 ? "ítem" : "ítems"}`
                  : "· agrega productos"}
              </span>
            </div>
            <button
              type="button"
              onClick={submitQuote}
              disabled={submitting || lines.length === 0 || hasContactErrors}
              aria-label={
                lines.length === 0
                  ? "Enviar cotización (agrega al menos un producto)"
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
