"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import StatusTag from "@/components/ui/StatusTag";
import { money } from "@/lib/client";
import type { BusinessConfig } from "@/lib/types/domain";
import {
  buildConfirmationDisplay,
  buildWaLink,
  formatCustomFieldDisplay,
  getStatusLabels,
  isDeliveredStatus
} from "../lib/helpers";

// ─── Receipt ──────────────────────────────────────────────────────────

export function Receipt({ order, waLink, liveUrl, message }: { order: any; waLink: string; liveUrl: string; message: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-xl border border-success-200 bg-white p-4 text-center shadow-card">
      <strong className="block text-slate-900">Tiquete Digital #{order?.order_number} Creado 🌱</strong>
      <p className="mt-1 text-sm text-slate-600">El cliente escanea este QR para ver su recibo digital en tiempo real 📸</p>
      <div className="mt-3 inline-block rounded-xl border border-success-200 bg-white p-3">
        <QRCodeSVG value={liveUrl} size={150} fgColor="#101828" bgColor="#ffffff" level="M" />
        <div className="mt-1 text-center text-[11px] font-extrabold text-success-700">📸 Ver Recibo Digital</div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-success-600 px-3 py-2 text-sm font-bold text-white">📱 Abrir WhatsApp</a>
        <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">🌐 Ver Tiquete</a>
        <button onClick={() => navigator.clipboard?.writeText(message).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
          {copied ? "✓ Copiado" : "📋 Copiar"}
        </button>
      </div>
    </div>
  );
}

// ─── Orders Table ─────────────────────────────────────────────────────

export function OrdersTable({ orders, loyalty, config, slug, onOpenQr, onChangeStatus, onOpenDeliveryLink, onRequestApproval, onOpenScanner }: {
  orders: any[]; loyalty: Record<string, any>; config: BusinessConfig; slug: string;
  onOpenQr: (o: any) => void; onChangeStatus: (o: any, s: string) => void;
  onOpenDeliveryLink: (o: any) => void; onRequestApproval: (o: any) => void; onOpenScanner: () => void;
}) {
  const statusLabels = getStatusLabels(config);
  const statusOptions = (orderStatus: string) => {
    const base = (config.status_flow_config || []).map((e: any) =>
      `<option value="${e.status_key}"${orderStatus === e.status_key ? " selected" : ""}>${e.display_label}</option>`).join("");
    return base + `<option value="CANCELLED"${orderStatus === "CANCELLED" ? " selected" : ""}>Cancelado</option>`;
  };

  const customFieldsDefs = config.custom_fields_config || [];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-left">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Tiquete</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Detalle & Ubicación</th>
            <th className="px-4 py-3">Saldo</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-400">No hay pedidos con este filtro.</td></tr>
          ) : orders.map((o) => {
            const loyaltyData = loyalty[o.customer_phone];
            const cf = o.custom_fields || {};
            const hasAddr = cf.direccion || cf.delivery_address || cf.address || cf.direccion_entrega;
            const isFinal = o.status === "CANCELLED" || isDeliveredStatus(o.status, config);
            return (
              <tr key={o.id} className="align-top hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <strong className="font-extrabold text-slate-900">#{o.order_number}</strong>
                  {loyaltyData && (
                    <span className="mt-1 inline-block rounded-full bg-warning-50 px-2 py-0.5 text-xs font-extrabold text-warning-700" title={`Fidelidad: ${loyaltyData.stamps_count} de ${loyaltyData.stamps_target} sellos`}>
                      🎟️ {loyaltyData.stamps_count}/{loyaltyData.stamps_target}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{o.customer_name || "—"}</div>
                  <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  <div>{o.items_text}</div>
                  {cf.service_type && <small className="block font-bold text-info-700">🧺 {cf.service_type}</small>}
                  {customFieldsDefs.map((def: any) => {
                    const v = formatCustomFieldDisplay(cf[def.field_key], def);
                    if (!v) return null;
                    return <small key={def.field_key} className="block text-[11px] text-slate-500"><strong>{def.display_label}:</strong> {v}</small>;
                  })}
                  <span dangerouslySetInnerHTML={{ __html: buildConfirmationDisplay(o) }} />
                </td>
                <td className="px-4 py-3 font-extrabold text-slate-900">{money.format(o.balance)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <StatusTag label={statusLabels[o.status] || o.status} statusKey={o.status} flow={config.status_flow_config} className="w-fit" />
                    <select className="w-fit rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold"
                      value={o.status} onChange={(e) => onChangeStatus(o, e.target.value)}>
                      {statusOptions(o.status).split("</option>").filter((x) => x.trim()).map((opt, i) => {
                        const m = opt.match(/value="([^"]+)"([^>]*)>([^<]+)/);
                        return m ? <option key={i} value={m[1]}>{m[3]}</option> : null;
                      })}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => onOpenQr(o)} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">📸 QR</button>
                    <a href={buildWaLink(o, "default", config, slug)} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">WhatsApp</a>
                    <a href={`${window.location.origin}/tiquete?number=${encodeURIComponent(String(o.order_number))}&slug=${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">🌐</a>
                    {hasAddr && !isFinal && (
                      <button onClick={() => onOpenDeliveryLink(o)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">🚚 Link Entrega</button>
                    )}
                    {!isFinal && (
                      <button onClick={() => onRequestApproval(o)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700">🧾 Cotización</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile Cards ─────────────────────────────────────────────────────

export function OrderCards({ orders, loyalty, config, slug, onOpenQr, onChangeStatus }: {
  orders: any[]; loyalty: Record<string, any>; config: BusinessConfig; slug: string;
  onOpenQr: (o: any) => void; onChangeStatus: (o: any, s: string) => void;
}) {
  const statusLabels = getStatusLabels(config);
  return (
    <div className="space-y-3 lg:hidden">
      {orders.length === 0 && <div className="rounded-lg bg-white p-6 text-center font-bold text-slate-400">No hay pedidos con este filtro.</div>}
      {orders.map((o) => {
        const loyaltyData = loyalty[o.customer_phone];
        const cf = o.custom_fields || {};
        const hasAddr = cf.direccion || cf.delivery_address || cf.address || cf.direccion_entrega;
        const isFinal = o.status === "CANCELLED" || isDeliveredStatus(o.status, config);
        return (
          <div key={o.id} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong className="text-lg font-extrabold text-slate-900">#{o.order_number}</strong>
                  <StatusTag label={statusLabels[o.status] || o.status} statusKey={o.status} flow={config.status_flow_config} />
                  {loyaltyData && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-extrabold text-warning-700">🎟️ {loyaltyData.stamps_count}/{loyaltyData.stamps_target}</span>}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-800">{o.customer_name || "—"}</div>
                <div className="text-xs text-slate-500">{o.customer_phone || "—"}</div>
              </div>
              <select className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm font-bold" value={o.status} onChange={(e) => onChangeStatus(o, e.target.value)}>
                {(config.status_flow_config || []).map((entry: any) => (
                  <option key={entry.status_key} value={entry.status_key}>{entry.display_label}</option>
                ))}
                <option value="CANCELLED">Cancelado</option>
              </select>
            </div>
            <div className="mt-2 text-sm text-slate-700">{o.items_text}</div>
            {cf.service_type && <div className="mt-1 text-xs font-bold text-info-700">🧺 {cf.service_type}</div>}
            <span className="mt-1 block text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: buildConfirmationDisplay(o) }} />
            <div className="mt-3 flex items-center justify-between">
              <strong className={o.balance > 0 ? "font-extrabold text-error-700" : "font-extrabold text-success-700"}>
                Saldo: {money.format(o.balance)}
              </strong>
              <div className="flex items-center gap-2">
                <button onClick={() => onOpenQr(o)} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-bold text-white">📸 QR</button>
                <a href={buildWaLink(o, "default", config, slug)} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold">📱 WhatsApp</a>
                <a href={`${window.location.origin}/tiquete?number=${encodeURIComponent(String(o.order_number))}&slug=${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold">🌐 Ver</a>
                {hasAddr && !isFinal && (
                  <button onClick={() => { /* handled via table props only */ }} className="hidden">🚚</button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────

export function KanbanBoard({ orders, config, onChangeStatus, onOpenQr, onOpenDeliveryLink, onRequestApproval, toastFn }: {
  orders: any[]; config: BusinessConfig;
  onChangeStatus: (o: any, s: string) => void; onOpenQr: (o: any) => void;
  onOpenDeliveryLink: (o: any) => void; onRequestApproval: (o: any) => void; toastFn: (m: string) => void;
}) {
  const columns = useMemo(() => {
    const keys = [...(config.status_flow_config || []).map((s: any) => s.status_key), "CANCELLED"];
    const labels = getStatusLabels(config);
    return keys.map((k) => ({ key: k, label: labels[k] || k, items: orders.filter((o) => o.status === k) }));
  }, [orders, config]);

  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
      {columns.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragId) {
              onChangeStatus(orders.find((o) => o.id === dragId)!, col.key);
              setDragId(null);
            }
          }}
          className="w-[86vw] max-w-[86vw] shrink-0 snap-center rounded-xl border border-slate-200 bg-slate-50 p-3 md:w-auto md:max-w-none"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <StatusTag label={col.label} statusKey={col.key} flow={config.status_flow_config} />
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.map((o) => (
              <div
                key={o.id}
                draggable
                onDragStart={() => setDragId(o.id)}
                className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-slate-900">#{o.order_number}</strong>
                  <span className="text-xs font-bold text-slate-500">{o.customer_name || "—"}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2">{o.items_text}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                  <strong className={o.balance > 0 ? "text-xs font-extrabold text-error-700" : "text-xs font-extrabold text-success-700"}>
                    {o.balance > 0 ? "Saldo " + money.format(o.balance) : "Pagado"}
                  </strong>
                  <span className="flex gap-1.5">
                    <button onClick={() => onOpenQr(o)} className="rounded bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">📸</button>
                    <button onClick={() => onRequestApproval(o)} className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-bold" disabled={o.status === "CANCELLED" || isDeliveredStatus(o.status, config)}>🧾</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
