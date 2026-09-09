"use client";

/**
 * Fruver owner panel container (R4.1, R5.4, R6.1).
 *
 * This is the scaffold that hosts the fruver-specific sub-panels inside
 * `/panel`. It is mounted conditionally by `app/panel/page.tsx` only when the
 * active business belongs to the fruver vertical (see `isFruverVertical`).
 *
 * The concrete sub-panels are built in later tasks and dropped into the
 * mount points below without reworking this container:
 *   - CatalogManager   → task 5.1  (`manage-products`)      R4
 *   - PromotionsManager → task 6.1 (`manage-promotions`)    R5
 *   - QuotesPanel      → task 7.1  (`quotes-admin`)         R6, R7
 *   - FruverAnalytics  → task 7.2  (`fruver-analytics`)     R6.3
 *
 * Each sub-panel is lazily imported so its code only loads when the owner opens
 * the matching sub-tab, keeping the main panel bundle lean.
 */

// NOTE: when wiring a concrete sub-panel below, add `lazy` to this import and
// set the section's `Component` to `lazy(() => import("./CatalogManager"))`.
import { Suspense, lazy, useState, type ComponentType } from "react";
import Link from "next/link";
import { BarChart3, Compass, ReceiptText, ShoppingBasket, Tag, type LucideIcon } from "lucide-react";

// ─── Concrete sub-panels (tasks 5.1, 6.1, 7.1, 7.2) ────────────────────────
// Lazily loaded so each section's code only ships when its sub-tab is opened.
const CatalogManager = lazy(() => import("./CatalogManager"));
const PromotionsManager = lazy(() => import("./PromotionsManager"));
const QuotesPanel = lazy(() => import("./QuotesPanel"));
const FruverAnalytics = lazy(() => import("./FruverAnalytics"));

// ─── Lazy mount points for the sub-panels (filled by later tasks) ──────────
//
// Later tasks create these files under `app/panel/fruver/`. Until then the
// scaffold shows a "coming soon" placeholder (see `PlaceholderPanel`) so the
// tab renders and is wired without dead code or broken imports.
//
// When a sub-panel file exists, replace its `null` entry with:
//   const CatalogManager = lazy(() => import("./CatalogManager"));
// and pass it through in the `SECTIONS` table below.

export interface FruverPanelProps {
  /** Active business id, forwarded to sub-panels for `business_id` scoping. */
  businessId: string;
  /** Active business slug, used for ticket/QR links in the quotes bridge. */
  slug: string;
  /** Business display name for headings. */
  businessName: string;
  /** Toast helper shared with the rest of the panel. */
  toastFn: (message: string) => void;
}

type SubPanelKey = "catalog" | "promotions" | "quotes" | "analytics";

interface SubPanelDef {
  key: SubPanelKey;
  label: string;
  icon: LucideIcon;
  /**
   * Lazily-loaded component for the section, or `null` while the concrete
   * sub-panel has not been implemented yet (later tasks fill these in).
   */
  Component: ComponentType<FruverPanelProps> | null;
}

// Mount points. Set `Component` to a `lazy(() => import("./X"))` once the
// concrete sub-panel exists. Order defines the sub-tab order.
const SUB_PANELS: SubPanelDef[] = [
  { key: "catalog", label: "Catálogo", icon: ShoppingBasket, Component: CatalogManager },
  { key: "promotions", label: "Promociones", icon: Tag, Component: PromotionsManager },
  { key: "quotes", label: "Cotizaciones", icon: ReceiptText, Component: QuotesPanel },
  { key: "analytics", label: "Analítica", icon: BarChart3, Component: FruverAnalytics }
];

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-bold text-slate-600">
        {label} estará disponible en breve.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Esta sección se conectará con los endpoints de fruver en los próximos pasos.
      </p>
    </div>
  );
}

export default function FruverPanel(props: FruverPanelProps) {
  const [active, setActive] = useState<SubPanelKey>("catalog");
  const current = SUB_PANELS.find((p) => p.key === active) ?? SUB_PANELS[0];
  const ActiveComponent = current.Component;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <strong className="text-lg font-extrabold text-slate-900">
            🥬 Panel Fruver
          </strong>
          <div className="text-sm text-slate-500">
            Gestiona catálogo, promociones, cotizaciones y analítica de {props.businessName}.
          </div>
        </div>
        {/* Acceso directo al Centro de gestión: agrupa todos los enlaces del
            negocio (panel, catálogo público, tiquetes, entregas) por perfil. */}
        <Link
          href={`/fruver/${props.slug}/inicio`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Compass size={16} aria-hidden="true" />
          Centro de gestión
          <span className="sr-only">, abre en una nueva pestaña</span>
        </Link>
      </div>

      {/* Sub-tabs */}
      <div
        role="tablist"
        aria-label="Secciones del panel fruver"
        className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3"
      >
        {SUB_PANELS.map((panel, index) => {
          const isActive = panel.key === active;
          const tabId = `fruver-tab-${panel.key}`;
          const panelId = `fruver-panel-${panel.key}`;
          const Icon = panel.icon;
          return (
            <button
              key={panel.key}
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(panel.key)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const next = SUB_PANELS[(index + direction + SUB_PANELS.length) % SUB_PANELS.length];
                setActive(next.key);
                document.getElementById(`fruver-tab-${next.key}`)?.focus();
              }}
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon size={16} aria-hidden="true" /> {panel.label}
            </button>
          );
        })}
      </div>

      {/* Active sub-panel */}
      <div id={`fruver-panel-${current.key}`} role="tabpanel" aria-labelledby={`fruver-tab-${current.key}`} tabIndex={0}>
        {ActiveComponent ? (
          <Suspense
            fallback={
              <div className="grid place-items-center py-8 text-sm font-bold text-slate-500">
                Cargando…
              </div>
            }
          >
            <ActiveComponent {...props} />
          </Suspense>
        ) : (
          <PlaceholderPanel label={current.label} />
        )}
      </div>
    </section>
  );
}
