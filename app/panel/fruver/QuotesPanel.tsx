"use client";

/**
 * QuotesPanel — Gestor de Cotizaciones del Dueño (R6.1, R6.2, R6.4).
 *
 * Mounted inside `FruverPanel` (see `FruverPanel.tsx`) and receives the shared
 * `FruverPanelProps`. It reuses the existing `quotes-admin` endpoint (no new
 * endpoints):
 *
 *   * `list`           — lists the business's quotes, most recent first (R6.1).
 *   * `mark-converted` — transitions a quote to `convertida`, stamping
 *                        `converted_at` server-side (R6.2). The record is never
 *                        deleted; lines and total are preserved.
 *
 * Scope of THIS component (task 7.1): list quotes, mark converted, and show the
 * status. The full "Convertir en pedido" flow (create-order + ticket QR) is
 * added in tasks 8.2/9.1. To let those extend this component without rework:
 *   - `refresh()` re-fetches the list and is safe to call after any mutation.
 *   - `updateQuoteInList()` merges an updated quote row returned by the API,
 *     so a future convert flow can splice in the row it gets back from
 *     `mark-converted` (which may also carry `order_id`).
 *   - The per-row action area is isolated in `QuoteRow` so the future
 *     "Convertir en pedido" button/QR can be dropped in beside "Marcar
 *     convertida" without touching the list/loading logic.
 *
 * All operations are scoped by `businessId`; auth is handled by `apiPostJSON`
 * attaching the stored bearer token, and by the endpoint's `manage_business`
 * check (R6.4). Errors degrade gracefully with a toast + inline message (R8.5).
 */

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { apiPostJSON, money } from "@/lib/client";
import type { Quote, QuoteLine } from "@/lib/fruver/types";
import {
  convertQuoteToOrder,
  type ConvertibleQuote,
  type CreateOrderPayload,
  type CreateOrderResult
} from "@/lib/fruver/order-bridge";
import type { FruverPanelProps } from "./FruverPanel";

const QUOTES_ADMIN_URL = "/api/quotes-admin";
const CREATE_ORDER_URL = "/api/create-order";
const DELIVERY_CONFIRM_URL = "/api/delivery-confirm";

/**
 * Turn a relative ticket path (`/tiquete?...`) into an absolute URL so the QR
 * encodes something a phone camera can open. Mirrors the panel's existing
 * `window.location.origin` pattern; falls back to the relative path on SSR.
 */
function toAbsoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** Format an ISO timestamp for the es-CO locale; empty string if missing/invalid. */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Readable one-line summary of the selected products (name, qty, unit). */
function linesSummary(lines: QuoteLine[] | null | undefined): string {
  if (!Array.isArray(lines) || lines.length === 0) return "Sin productos";
  return lines.map((l) => `${l.qty} ${l.unit} ${l.name}`).join(", ");
}

function StatusBadge({ status }: { status: Quote["status"] }) {
  const isConverted = status === "convertida";
  const cls = isConverted
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700";
  const label = isConverted ? "Convertida" : "Enviada";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

interface QuoteRowProps {
  quote: Quote;
  busy: boolean;
  onMarkConverted: (quote: Quote) => void;
  onConvert: (quote: Quote) => void;
}

function QuoteRow({ quote, busy, onMarkConverted, onConvert }: QuoteRowProps) {
  const isConverted = quote.status === "convertida";
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={quote.status} />
            {quote.from_frequent_list ? (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-700">
                Recompra
              </span>
            ) : null}
          </div>
          <p className="mt-2 break-words text-sm text-slate-700">
            {linesSummary(quote.lines)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Enviada: {formatDateTime(quote.created_at) || "—"}
            {isConverted && quote.converted_at
              ? ` · Convertida: ${formatDateTime(quote.converted_at)}`
              : ""}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <strong className="text-lg font-extrabold text-slate-900">
            {money.format(Number(quote.estimated_total || 0))}
          </strong>
          {/*
            Per-row actions. "Convertir en pedido" (task 8.2) creates the order
            via `create-order` and links it back to the quote; "Marcar
            convertida" only updates the status. The ticket QR/link (task 9.1)
            is shown by the parent after a successful conversion.
          */}
          {isConverted ? (
            <span className="text-xs font-bold text-emerald-600">✓ Cotización convertida</span>
          ) : (
            <div className="flex flex-col items-stretch gap-2 md:items-end">
              <button
                type="button"
                onClick={() => onConvert(quote)}
                disabled={busy}
                className="min-h-[40px] rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Procesando…" : "Convertir en pedido"}
              </button>
              <button
                type="button"
                onClick={() => onMarkConverted(quote)}
                disabled={busy}
                className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Guardando…" : "Solo marcar convertida"}
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Customer contact data collected before converting a quote into an order. */
interface ConvertFormValues {
  name: string;
  phone: string;
  address: string;
}

interface ConvertDialogProps {
  quote: Quote;
  busy: boolean;
  onSubmit: (values: ConvertFormValues) => void;
  onCancel: () => void;
}

/**
 * Modal that collects the mandatory phone (R7.5) and optional name/address
 * before creating the order. Quotes don't carry contact data inline, so we ask
 * for it here; the phone is required because the ticket/WhatsApp flow needs it.
 */
function ConvertDialog({ quote, busy, onSubmit, onCancel }: ConvertDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    if (name.trim() === "") {
      setLocalError("El nombre del cliente es obligatorio.");
      return;
    }
    if (phone.trim() === "") {
      setLocalError("El teléfono del cliente es obligatorio para crear el pedido.");
      return;
    }
    setLocalError(null);
    onSubmit({ name: name.trim(), phone: phone.trim(), address: address.trim() });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Convertir cotización en pedido"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
        <h3 className="text-base font-extrabold text-slate-900">Convertir en pedido</h3>
        <p className="mt-1 text-sm text-slate-500">{linesSummary(quote.lines)}</p>
        <p className="mt-1 text-sm font-bold text-slate-700">
          Total: {money.format(Number(quote.estimated_total || 0))}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            Nombre del cliente *
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            Teléfono *
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            Dirección de entrega
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
              className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            />
          </label>
        </div>

        {localError ? (
          <p className="mt-3 text-sm font-bold text-red-600">{localError}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="min-h-[40px] rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Procesando…" : "Crear pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuotesPanel({ businessId, slug, toastFn }: FruverPanelProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** id of the quote currently being mutated, to disable its row action. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Quote awaiting contact data in the convert-to-order dialog, if any. */
  const [convertTarget, setConvertTarget] = useState<Quote | null>(null);
  /**
   * Ticket info for the most recently converted quote. Task 9.1 renders the
   * QR + `/tiquete` link from this. `orderDbId` (the DB uuid returned by
   * `create-order`) is what `delivery-confirm` needs to mint a delivery token;
   * it is only available right after a real conversion (not on the idempotent
   * short-circuit path, where only the order number is known).
   */
  const [lastConversion, setLastConversion] = useState<{
    quoteId: string;
    orderNumber: string;
    ticketUrl: string;
    orderDbId: string | null;
  } | null>(null);
  /** Generated delivery-tracking link (via `delivery-confirm`), if any. */
  const [deliveryLink, setDeliveryLink] = useState<string | null>(null);
  /** True while a delivery link is being generated. */
  const [deliveryBusy, setDeliveryBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { ok, data } = await apiPostJSON(QUOTES_ADMIN_URL, {
      action: "list",
      business_id: businessId
    });
    if (ok && Array.isArray(data)) {
      setQuotes(data as Quote[]);
    } else {
      const message =
        (data && (data.message || data.error)) || "No se pudieron cargar las cotizaciones.";
      setErrorMsg(typeof message === "string" ? message : "No se pudieron cargar las cotizaciones.");
      setQuotes([]);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Merge an updated quote row into the list without a full refetch. Exposed
   * for the future convert flow (tasks 8.2/9.1) which also receives a row back.
   */
  const updateQuoteInList = useCallback((updated: Quote) => {
    setQuotes((prev) => prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q)));
  }, []);

  const handleMarkConverted = useCallback(
    async (quote: Quote) => {
      setBusyId(quote.id);
      const { ok, data } = await apiPostJSON(QUOTES_ADMIN_URL, {
        action: "mark-converted",
        business_id: businessId,
        quote_id: quote.id
      });
      setBusyId(null);
      if (ok && data && data.id) {
        updateQuoteInList(data as Quote);
        toastFn("Cotización marcada como convertida.");
      } else {
        const message =
          (data && (data.message || data.error)) || "No se pudo marcar la cotización.";
        toastFn(typeof message === "string" ? message : "No se pudo marcar la cotización.");
      }
    },
    [businessId, toastFn, updateQuoteInList]
  );

  /**
   * Open the convert-to-order dialog. If the quote already has an `order_id`
   * it is already converted, so we short-circuit (idempotency, R7.3) and just
   * surface its ticket link instead of prompting again.
   */
  const handleOpenConvert = useCallback(
    (quote: Quote) => {
      if (quote.order_id != null && quote.order_id !== "") {
        setLastConversion({
          quoteId: quote.id,
          orderNumber: quote.order_id,
          ticketUrl: `/tiquete?number=${encodeURIComponent(quote.order_id)}&slug=${encodeURIComponent(slug)}`,
          // The stored link is the order number, not the DB uuid; the delivery
          // link can only be minted right after a fresh conversion.
          orderDbId: null
        });
        setDeliveryLink(null);
        toastFn("Esta cotización ya fue convertida en pedido.");
        return;
      }
      setConvertTarget(quote);
    },
    [slug, toastFn]
  );

  /**
   * Convert the target quote into an order (R7.1–R7.3, R7.5): create the order
   * via `create-order`, then link it back to the quote via `quotes-admin`
   * `mark-converted`. Idempotency is enforced by the shared bridge helper.
   */
  const handleConvertSubmit = useCallback(
    async (values: ConvertFormValues) => {
      const quote = convertTarget;
      if (!quote) return;
      setBusyId(quote.id);

      // Captured from the create-order response so the delivery-link action can
      // reference the order's DB id (delivery-confirm needs it, not the number).
      let createdOrderDbId: string | null = null;

      const convertible: ConvertibleQuote = {
        id: quote.id,
        lines: Array.isArray(quote.lines) ? quote.lines : [],
        estimated_total: Number(quote.estimated_total || 0),
        order_id: quote.order_id
      };

      // Injected create-order call: maps the bridge payload onto the existing
      // `create-order` contract and unwraps the returned order row.
      const createOrder = async (payload: CreateOrderPayload): Promise<CreateOrderResult> => {
        const { ok, data } = await apiPostJSON(CREATE_ORDER_URL, {
          business_id: businessId,
          businessSlug: payload.businessSlug,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerAddress: payload.customerAddress,
          itemsText: payload.itemsText,
          total: payload.total
        });
        if (!ok || !data || (data.error && !data.order_number)) {
          const message =
            (data && (data.message || data.error)) || "No se pudo crear el pedido.";
          throw new Error(typeof message === "string" ? message : "No se pudo crear el pedido.");
        }
        // Remember the DB uuid for the delivery-link action (task 9.1).
        createdOrderDbId = data.id != null ? String(data.id) : null;
        return {
          orderNumber: String(data.order_number),
          ticketToken: String(data.ticket_token || "")
        };
      };

      // Injected mark-converted call: links order_id and flips status.
      const markConverted = async (args: {
        businessId: string;
        quoteId: string;
        orderId: string;
      }): Promise<void> => {
        const { ok, data } = await apiPostJSON(QUOTES_ADMIN_URL, {
          action: "mark-converted",
          business_id: args.businessId,
          quote_id: args.quoteId,
          order_id: args.orderId
        });
        if (ok && data && data.id) {
          updateQuoteInList(data as Quote);
        }
        // A failure here does not undo the created order; surface it below.
        if (!ok) {
          const message =
            (data && (data.message || data.error)) || "El pedido se creó pero no se pudo enlazar a la cotización.";
          throw new Error(typeof message === "string" ? message : "El pedido se creó pero no se pudo enlazar a la cotización.");
        }
      };

      try {
        const result = await convertQuoteToOrder(
          {
            quote: convertible,
            businessId,
            businessSlug: slug,
            customerName: values.name,
            customerPhone: values.phone,
            customerAddress: values.address || undefined
          },
          { createOrder, markConverted }
        );
        // Store ticket info for task 9.1 (QR + link). `orderDbId` is only known
        // when an order was actually created on this call.
        setLastConversion({
          quoteId: quote.id,
          orderNumber: result.orderNumber,
          ticketUrl: result.ticketUrl,
          orderDbId: result.created ? createdOrderDbId : null
        });
        setDeliveryLink(null);
        setConvertTarget(null);
        toastFn(
          result.created
            ? `Pedido ${result.orderNumber} creado desde la cotización.`
            : "Esta cotización ya estaba convertida."
        );
      } catch (err: any) {
        toastFn(err?.message || "No se pudo convertir la cotización.");
      } finally {
        setBusyId(null);
      }
    },
    [convertTarget, businessId, slug, toastFn, updateQuoteInList]
  );

  /**
   * Generate a delivery-tracking link for the just-created order (R7.4, R7.6),
   * reusing the existing `delivery-confirm` `generate-token` action. It needs
   * the order's DB id (captured from `create-order`); the endpoint enforces
   * business isolation and the `update_order` permission.
   */
  const handleGenerateDeliveryLink = useCallback(async () => {
    if (!lastConversion || !lastConversion.orderDbId) return;
    setDeliveryBusy(true);
    const { ok, data } = await apiPostJSON(DELIVERY_CONFIRM_URL, {
      action: "generate-token",
      order_id: lastConversion.orderDbId,
      business_id: businessId
    });
    setDeliveryBusy(false);
    if (ok && data && data.delivery_url) {
      setDeliveryLink(String(data.delivery_url));
      toastFn("Link de entrega generado.");
    } else {
      const message =
        (data && (data.message || data.error)) || "No se pudo generar el link de entrega.";
      toastFn(typeof message === "string" ? message : "No se pudo generar el link de entrega.");
    }
  }, [lastConversion, businessId, toastFn]);

  if (loading) {
    return (
      <div className="grid place-items-center py-10 text-sm font-bold text-slate-500">
        Cargando cotizaciones…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-700">{errorMsg}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 min-h-[40px] rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm font-bold text-slate-600">Aún no hay cotizaciones.</p>
        <p className="mt-1 text-xs text-slate-500">
          Las cotizaciones que envíen tus clientes aparecerán aquí, las más recientes primero.
        </p>
      </div>
    );
  }

  const converted = quotes.filter((q) => q.status === "convertida").length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">
          {quotes.length} {quotes.length === 1 ? "cotización" : "cotizaciones"}
          <span className="ml-2 font-normal text-slate-500">· {converted} convertida(s)</span>
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Actualizar
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {quotes.map((quote) => (
          <QuoteRow
            key={quote.id}
            quote={quote}
            busy={busyId === quote.id}
            onMarkConverted={handleMarkConverted}
            onConvert={handleOpenConvert}
          />
        ))}
      </ul>

      {/*
        Post-conversion tracking card (task 9.1, R7.2/R7.4/R7.6): shows the QR
        that encodes the public `/tiquete` link so the customer can follow the
        delivery, the link itself, and a button to mint a delivery-tracking
        link via the existing `delivery-confirm` endpoint (no new endpoints).
      */}
      {lastConversion ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-emerald-800">
              Pedido {lastConversion.orderNumber} listo para seguimiento.
            </p>
            <button
              type="button"
              onClick={() => {
                setLastConversion(null);
                setDeliveryLink(null);
              }}
              aria-label="Cerrar seguimiento del pedido"
              className="rounded-md px-2 text-lg font-bold leading-none text-emerald-700 transition hover:text-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              ×
            </button>
          </div>

          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <QRCodeSVG
                value={toAbsoluteUrl(lastConversion.ticketUrl)}
                size={160}
                fgColor="#101828"
                bgColor="#ffffff"
                level="M"
              />
              <p className="mt-1 text-center text-[11px] font-extrabold text-emerald-700">
                📸 Escanea para seguir el pedido
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Enlace del tiquete
              </p>
              <a
                href={lastConversion.ticketUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block break-all text-sm font-bold text-emerald-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                {toAbsoluteUrl(lastConversion.ticketUrl)}
              </a>

              <div className="mt-4">
                {lastConversion.orderDbId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleGenerateDeliveryLink()}
                      disabled={deliveryBusy}
                      className="min-h-[40px] rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deliveryBusy ? "Generando…" : "🚚 Generar link de entrega"}
                    </button>
                    {deliveryLink ? (
                      <div className="mt-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                          Link de entrega (válido 2 horas)
                        </p>
                        <a
                          href={deliveryLink}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block break-all text-sm font-bold text-emerald-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                        >
                          {deliveryLink}
                        </a>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-emerald-700">
                    El link de entrega se genera al convertir la cotización en pedido.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {convertTarget ? (
        <ConvertDialog
          quote={convertTarget}
          busy={busyId === convertTarget.id}
          onSubmit={handleConvertSubmit}
          onCancel={() => setConvertTarget(null)}
        />
      ) : null}
    </div>
  );
}
