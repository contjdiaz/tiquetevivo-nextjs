"use client";

/**
 * FruverAnalytics — pilot analytics view for the fruver owner panel (R6.3, R6.4).
 *
 * Displays the pilot metrics for the active business by consuming the existing
 * `fruver-analytics` endpoint (never creates a new endpoint). The endpoint
 * follows the platform's admin handler pattern (see `quotes-admin`): a POST
 * with `{ action, business_id, from, to }`, authorized with an operator token
 * (`read` / `manage_business`), returning the aggregated report shaped like
 * `lib/fruver/analytics.ts#PilotAnalytics`:
 *
 *   - weekly_sent[]            → cotizaciones por semana (R6.3)
 *   - conversion_percentage    → % de conversión, 0 si no hay enviadas (R6.3)
 *   - repurchase_customers     → recompras con lista frecuente (R6.3)
 *   - average_estimated_total  → Total_Estimado promedio (R6.3)
 *
 * All figures are scoped to `business_id` by the endpoint (R6.4, isolation).
 * The view degrades with clear messages on network/authorization errors
 * without breaking the UI (R8.5).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPostJSON, money } from "@/lib/client";
import type { FruverPanelProps } from "./FruverPanel";

/** One weekly bucket of sent quotes (mirrors analytics.ts#WeeklyQuoteCount). */
interface WeeklyQuoteCount {
  week_start: string;
  count: number;
}

/** Aggregated pilot analytics report (mirrors analytics.ts#PilotAnalytics). */
interface PilotAnalytics {
  weekly_sent: WeeklyQuoteCount[];
  total_sent: number;
  total_converted: number;
  conversion_percentage: number;
  repurchase_customers: number;
  average_estimated_total: number;
}

/** Default range: last 90 days up to now (inclusive), as ISO 8601 strings. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** Coerces an unknown value into a finite number, defaulting to 0. */
function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalizes an arbitrary endpoint payload into a safe `PilotAnalytics` so the
 * view never crashes on missing/partial fields (R8.5).
 */
function normalizeAnalytics(raw: any): PilotAnalytics {
  const weekly = Array.isArray(raw?.weekly_sent) ? raw.weekly_sent : [];
  return {
    weekly_sent: weekly
      .filter((w: any) => w && typeof w.week_start === "string")
      .map((w: any) => ({ week_start: w.week_start, count: toNumber(w.count) })),
    total_sent: toNumber(raw?.total_sent),
    total_converted: toNumber(raw?.total_converted),
    conversion_percentage: toNumber(raw?.conversion_percentage),
    repurchase_customers: toNumber(raw?.repurchase_customers),
    average_estimated_total: toNumber(raw?.average_estimated_total)
  };
}

/** Formats an ISO week-start timestamp into a short human-readable label. */
function formatWeek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

interface MetricCardProps {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}

function MetricCard({ icon, label, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export default function FruverAnalytics({ businessId, businessName, toastFn }: FruverPanelProps) {
  const [range] = useState(() => defaultRange());
  const [data, setData] = useState<PilotAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, status, data: payload } = await apiPostJSON("/api/fruver-analytics", {
        action: "report",
        business_id: businessId,
        from: range.from,
        to: range.to
      });

      if (!ok) {
        const message =
          status === 401 || status === 403
            ? "No tienes permiso para ver la analítica de este negocio."
            : payload?.message || payload?.error || "No se pudo cargar la analítica.";
        setError(typeof message === "string" ? message : "No se pudo cargar la analítica.");
        setData(null);
        return;
      }

      setData(normalizeAnalytics(payload));
    } catch {
      setError("Error de red al cargar la analítica. Revisa tu conexión e intenta de nuevo.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, range.from, range.to]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const maxWeekCount = useMemo(() => {
    if (!data || data.weekly_sent.length === 0) return 0;
    return data.weekly_sent.reduce((max, w) => (w.count > max ? w.count : max), 0);
  }, [data]);

  const rangeLabel = `${formatWeek(range.from)} – ${formatWeek(range.to)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <strong className="text-base font-extrabold text-slate-900">
            📊 Analítica del piloto
          </strong>
          <div className="text-xs text-slate-500">
            Métricas de {businessName} · {rangeLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            loadAnalytics();
            toastFn("Actualizando analítica…");
          }}
          disabled={loading}
          className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-50 md:self-auto"
        >
          🔄 Actualizar
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10 text-sm font-bold text-slate-500">
          Cargando analítica…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-bold text-amber-700">{error}</p>
          <button
            type="button"
            onClick={loadAnalytics}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            Reintentar
          </button>
        </div>
      ) : data ? (
        <>
          {/* Summary metric cards (R6.3) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon="🧾"
              label="Cotizaciones enviadas"
              value={String(data.total_sent)}
              hint={`${data.total_converted} convertidas`}
            />
            <MetricCard
              icon="✅"
              label="Conversión"
              value={`${data.conversion_percentage.toFixed(1)}%`}
              hint="0% si no hay enviadas"
            />
            <MetricCard
              icon="🔁"
              label="Recompras"
              value={String(data.repurchase_customers)}
              hint="con lista frecuente"
            />
            <MetricCard
              icon="💰"
              label="Total estimado promedio"
              value={money.format(data.average_estimated_total)}
              hint="por cotización enviada"
            />
          </div>

          {/* Weekly sent quotes (R6.3) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <strong className="text-sm font-extrabold text-slate-700">
              Cotizaciones por semana
            </strong>
            {data.weekly_sent.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aún no hay cotizaciones enviadas en este periodo.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {data.weekly_sent.map((week) => {
                  const pct = maxWeekCount > 0 ? (week.count / maxWeekCount) * 100 : 0;
                  return (
                    <li key={week.week_start} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs font-bold text-slate-500">
                        {formatWeek(week.week_start)}
                      </span>
                      <div
                        className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100"
                        role="img"
                        aria-label={`Semana del ${formatWeek(week.week_start)}: ${week.count} cotizaciones`}
                      >
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all"
                          style={{ width: `${Math.max(pct, week.count > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm font-extrabold text-slate-900">
                        {week.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
