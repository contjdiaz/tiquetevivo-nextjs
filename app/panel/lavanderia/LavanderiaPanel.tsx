"use client";

/**
 * Lavanderia owner panel container.
 *
 * This is the scaffold that hosts the lavanderia-specific sub-panels inside
 * `/panel`. It is mounted conditionally by `app/panel/page.tsx` only when the
 * active business belongs to the lavanderia vertical (see
 * `isLavanderiaVertical`).
 *
 * Sub-panels:
 *   - ServicesManager  → CRUD sobre `services_config` (`manage-business`)
 *   - QuotesPanel      → reutiliza el panel compartido de cotizaciones
 *   - LavanderiaAnalytics → métricas de cotizaciones
 *
 * Each sub-panel is lazily imported so its code only loads when the owner opens
 * the matching sub-tab, keeping the main panel bundle lean.
 */

import { Suspense, lazy, useState, type ComponentType } from "react";
import Link from "next/link";
import { BarChart3, Compass, ReceiptText, Sparkles, type LucideIcon } from "lucide-react";

const ServicesManager = lazy(() => import("./ServicesManager"));
const QuotesPanel = lazy(() => import("../fruver/QuotesPanel"));
const LavanderiaAnalytics = lazy(() => import("./LavanderiaAnalytics"));

export interface LavanderiaPanelProps {
  /** Active business id, forwarded to sub-panels for `business_id` scoping. */
  businessId: string;
  /** Active business slug, used for ticket/QR links in the quotes bridge. */
  slug: string;
  /** Business display name for headings. */
  businessName: string;
  /** Toast helper shared with the rest of the panel. */
  toastFn: (message: string) => void;
}

type SubPanelKey = "services" | "quotes" | "analytics";

interface SubPanelDef {
  key: SubPanelKey;
  label: string;
  icon: LucideIcon;
  Component: ComponentType<LavanderiaPanelProps>;
}

const SUB_PANELS: SubPanelDef[] = [
  { key: "services", label: "Servicios", icon: Sparkles, Component: ServicesManager },
  { key: "quotes", label: "Cotizaciones", icon: ReceiptText, Component: QuotesPanel },
  { key: "analytics", label: "Analítica", icon: BarChart3, Component: LavanderiaAnalytics }
];

export default function LavanderiaPanel(props: LavanderiaPanelProps) {
  const [active, setActive] = useState<SubPanelKey>("services");
  const current = SUB_PANELS.find((p) => p.key === active) ?? SUB_PANELS[0];
  const ActiveComponent = current.Component;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <strong className="text-lg font-extrabold text-slate-900">
            🧺 Panel Lavandería
          </strong>
          <div className="text-sm text-slate-500">
            Gestiona servicios, cotizaciones y analítica de {props.businessName}.
          </div>
        </div>
        {/* Acceso directo al Centro de Lavandería: agrupa todos los enlaces del
            negocio (panel, cotizador público, tiquetes, entregas) por perfil. */}
        <Link
          href={`/lavanderia/${props.slug}/inicio`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Compass size={16} aria-hidden="true" />
          Centro de Lavandería
          <span className="sr-only">, abre en una nueva pestaña</span>
        </Link>
      </div>

      {/* Sub-tabs */}
      <div
        role="tablist"
        aria-label="Secciones del panel de lavandería"
        className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3"
      >
        {SUB_PANELS.map((panel, index) => {
          const isActive = panel.key === active;
          const tabId = `lavanderia-tab-${panel.key}`;
          const panelId = `lavanderia-panel-${panel.key}`;
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
                document.getElementById(`lavanderia-tab-${next.key}`)?.focus();
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
      <div id={`lavanderia-panel-${current.key}`} role="tabpanel" aria-labelledby={`lavanderia-tab-${current.key}`} tabIndex={0}>
        <Suspense
          fallback={
            <div className="grid place-items-center py-8 text-sm font-bold text-slate-500">
              Cargando…
            </div>
          }
        >
          <ActiveComponent {...props} />
        </Suspense>
      </div>
    </section>
  );
}