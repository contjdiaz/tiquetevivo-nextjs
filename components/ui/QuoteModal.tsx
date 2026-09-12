"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";

type QuoteModalProps = {
  /** Controla la visibilidad del modal. */
  open: boolean;
  /** Se invoca al cerrar/cancelar sin confirmar. NO debe producir mutacion. */
  onClose: () => void;
  /**
   * Se invoca al confirmar con un valor monetario valido (numero positivo)
   * y la descripcion opcional. Solo se llama cuando la validacion pasa.
   */
  onConfirm: (amount: number, description: string) => void;
  /** Valor inicial sugerido para el monto (por ejemplo, el total de la orden). */
  defaultAmount?: number | string;
  /** Descripcion inicial sugerida (por ejemplo, el detalle de items). */
  defaultDescription?: string;
  /** Numero/identificador de la orden para mostrar en la vista previa. */
  orderNumber?: string | number;
  /** Nombre del cliente para personalizar la vista previa. */
  customerName?: string;
};

// Formateador de moneda en pesos colombianos para la vista previa.
const CURRENCY_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

/** Convierte una entrada de texto a un numero, descartando separadores no numericos. */
function parseAmount(raw: string): number {
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  return Number(cleaned);
}

/**
 * Modal de cotizacion que reemplaza `window.prompt`.
 *
 * - Captura un valor monetario con validacion (numero positivo).
 * - Deshabilita "Confirmar" hasta que el valor sea valido.
 * - Muestra una vista previa del mensaje que se enviara antes de confirmar.
 * - Al cancelar, no se produce ninguna mutacion (solo se invoca `onClose`).
 */
export default function QuoteModal({
  open,
  onClose,
  onConfirm,
  defaultAmount,
  defaultDescription,
  orderNumber,
  customerName
}: QuoteModalProps) {
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  // Reinicia el formulario cada vez que se abre el modal.
  useEffect(() => {
    if (open) {
      setAmountText(defaultAmount != null ? String(defaultAmount) : "");
      setDescription(defaultDescription ?? "");
      setTouched(false);
    }
  }, [open, defaultAmount, defaultDescription]);

  const amount = useMemo(() => parseAmount(amountText), [amountText]);
  // Valido solo cuando es un numero finito y estrictamente positivo.
  const isValid = Number.isFinite(amount) && amount > 0;

  // Mensaje que se enviara; mostrado como vista previa antes de confirmar.
  const previewMessage = useMemo(() => {
    const lines: string[] = [];
    const greeting = customerName ? `Hola ${customerName}` : "Hola";
    lines.push(`${greeting}, tienes una cotización pendiente de aprobación.`);
    if (orderNumber != null && String(orderNumber).length > 0) {
      lines.push(`Pedido #${orderNumber}`);
    }
    lines.push(`Valor de la cotización: ${isValid ? CURRENCY_FORMATTER.format(amount) : "—"}`);
    if (description.trim()) {
      lines.push(`Detalle: ${description.trim()}`);
    }
    lines.push("Responde para aprobar o rechazar.");
    return lines.join("\n");
  }, [customerName, orderNumber, isValid, amount, description]);

  function handleConfirm() {
    setTouched(true);
    if (!isValid) return;
    onConfirm(amount, description.trim());
  }

  const showError = touched && !isValid;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generar cotización"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar y enviar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-info-50 px-3 py-2 text-xs text-info-700">
          ℹ️ Se enviará al cliente un enlace para <strong>aprobar o rechazar</strong> este valor adicional.
          El pedido no avanza hasta que el cliente responda.
        </p>
        <div>
          <label htmlFor="quote-amount" className="mb-1 block text-sm font-bold text-slate-700">
            Valor de la cotización (COP)
          </label>
          <input
            id="quote-amount"
            type="text"
            inputMode="numeric"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showError}
            aria-describedby={showError ? "quote-amount-error" : "quote-amount-hint"}
            placeholder="Ej. 25000"
            className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              showError ? "border-error-400" : "border-slate-200"
            }`}
          />
          {showError ? (
            <p id="quote-amount-error" className="mt-1 text-xs font-bold text-error-600">
              Ingresa un valor mayor a 0.
            </p>
          ) : (
            <p id="quote-amount-hint" className="mt-1 text-xs text-slate-500">
              {isValid ? `Se enviará por ${CURRENCY_FORMATTER.format(amount)}.` : "Solo números positivos."}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="quote-description" className="mb-1 block text-sm font-bold text-slate-700">
            Descripción (opcional)
          </label>
          <textarea
            id="quote-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Detalle de la cotización"
            className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          />
        </div>

        <div>
          <p className="mb-1 text-sm font-bold text-slate-700">Vista previa del mensaje</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {previewMessage}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
