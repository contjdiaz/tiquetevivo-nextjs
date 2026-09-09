import type { CSSProperties } from "react";
import type { PublicPromotionAny } from "@/lib/fruver/sanitize";
import type { AdvertisingBlocks } from "@/lib/fruver/advertising";

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

/**
 * Shared advertising renderer for the fruver vertical. Renders only the blocks
 * that have content so the page never shows an empty advertising section
 * (R3.2). Falls back to the raw vigent `promotions` list when composed
 * advertising blocks are not provided.
 *
 * Extracted from `QuoteBuilder.tsx` so both the public catalog and the
 * advertising page (`/fruver/[slug]/publicidad`) can consume it without
 * duplication. It is a presentational component with no client-side state,
 * so it is safe to render inside a Server Component.
 */
export default function AdvertisingSection({
  advertising,
  promotions,
  brandColor
}: {
  advertising?: AdvertisingBlocks;
  promotions: PublicPromotionAny[];
  brandColor?: string;
}) {
  const banners = advertising?.promotions ?? [];
  const seasonal = advertising?.seasonal ?? [];
  const combos = advertising?.combos ?? [];
  const socialInvite = advertising?.socialInvite ?? null;
  const discountCode = advertising?.discountCode ?? null;

  const hasComposed =
    banners.length > 0 ||
    seasonal.length > 0 ||
    combos.length > 0 ||
    Boolean(socialInvite) ||
    Boolean(discountCode);

  // Fallback: no composed blocks but there are vigent promotions to show.
  if (!hasComposed) {
    if (promotions.length === 0) return null;
    return (
      <section className="mt-5 space-y-3" style={{ "--fruver-primary": brandColor } as CSSProperties}>
        <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
          Promociones activas
        </h2>
        {promotions.map((promo, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-2xl border border-[var(--fruver-primary-border,#d1fae5)] bg-[var(--fruver-primary-soft,#ecfdf5)] px-4 py-3 shadow-sm"
          >
            <span className="mt-0.5 text-xl">📣</span>
            <p className="text-sm font-semibold text-[var(--fruver-primary-strong,#065f46)]">
              {promo.type === "banner" && promo.text}
              {promo.type === "combo" && `Combo con ${promo.discount_percent}% de descuento`}
              {promo.type === "discount_code" && (
                <>
                  Código <strong>{promo.code}</strong>: {promo.discount_percent}% de descuento
                </>
              )}
            </p>
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="mt-5 space-y-3" style={{ "--fruver-primary": brandColor } as CSSProperties}>
      <h2 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
        Promociones y novedades
      </h2>

      {/* Banners */}
      {banners.map((b, i) => (
        <div
          key={`banner-${i}`}
            className="flex items-start gap-3 rounded-2xl border border-[var(--fruver-primary-border,#d1fae5)] bg-[var(--fruver-primary-soft,#ecfdf5)] px-4 py-3 shadow-sm"
        >
          <span className="mt-0.5 text-2xl">📣</span>
          <div>
            <p className="text-sm font-bold text-[var(--fruver-primary-strong,#065f46)]">{b.text}</p>
          </div>
        </div>
      ))}

      {/* Combos */}
      {combos.map((c, i) => (
        <div
          key={`combo-${i}`}
          className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3 shadow-sm"
        >
          <span className="mt-0.5 text-2xl">🧺</span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-violet-500">
              Combo especial
            </p>
            <p className="mt-0.5 text-sm font-bold text-violet-800">
              {c.discount_percent}% de descuento en este combo
            </p>
          </div>
        </div>
      ))}

      {/* Seasonal products */}
      {seasonal.length > 0 && (
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 to-white px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌿</span>
            <span className="text-xs font-extrabold uppercase tracking-widest text-orange-600">
              De temporada — disponibles hoy
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {seasonal.map((p, i) => (
              <span
                key={`seasonal-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-bold text-orange-800 shadow-sm"
              >
                {p.name}
                <span className="text-orange-500">·</span>
                {formatMoney(p.day_price)}/{p.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Discount code */}
      {discountCode && (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-emerald-300 bg-white px-4 py-3 shadow-sm">
          <span className="mt-0.5 text-2xl">🎁</span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-600">
              Código para tu próxima compra
            </p>
            <p className="mt-0.5 text-sm text-slate-700">
              Usa el código{" "}
              <strong className="rounded bg-emerald-100 px-1.5 py-0.5 font-extrabold text-emerald-700">
                {discountCode.code}
              </strong>{" "}
              y obtén <strong>{discountCode.discount_percent}%</strong> de descuento.
            </p>
          </div>
        </div>
      )}

      {/* Social invite */}
      {socialInvite && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <span className="mt-0.5 text-2xl">💬</span>
          <p className="text-sm text-slate-600">{socialInvite}</p>
        </div>
      )}
    </section>
  );
}
