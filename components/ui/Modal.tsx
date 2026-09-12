"use client";

import { useCallback, useEffect, useRef } from "react";

type ModalProps = {
  /** Controla la visibilidad del modal. */
  open: boolean;
  /** Se invoca al cerrar (Escape, click en overlay o boton de cierre). */
  onClose: () => void;
  /** Titulo accesible del dialogo; se enlaza con `aria-labelledby`. */
  title?: string;
  /** Etiqueta accesible alternativa cuando no hay titulo visible. */
  ariaLabel?: string;
  /** Contenido del modal. */
  children: React.ReactNode;
  /** Contenido opcional del pie (acciones). */
  footer?: React.ReactNode;
  /** Clases extra para el panel del modal. */
  className?: string;
  /** Muestra el boton de cierre en la cabecera. Por defecto `true`. */
  showClose?: boolean;
  /** Cerrar al hacer click en el overlay. Por defecto `true`. */
  closeOnOverlay?: boolean;
};

// Selector de elementos potencialmente enfocables dentro del modal.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

let modalCounter = 0;

/**
 * Modal accesible reutilizable.
 *
 * - Expone `role="dialog"` y `aria-modal="true"`.
 * - Mueve el foco inicial al interior del modal al abrirse.
 * - Atrapa el foco (focus trap) con Tab / Shift+Tab.
 * - Se cierra con la tecla Escape.
 * - Retorna el foco al elemento que lo abrio al cerrarse.
 */
export default function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  children,
  footer,
  className = "",
  showClose = true,
  closeOnOverlay = true
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Elemento que tenia el foco antes de abrir, para restaurarlo al cerrar.
  const triggerRef = useRef<HTMLElement | null>(null);
  // Id estable para enlazar el titulo via aria-labelledby.
  const titleIdRef = useRef<string>("");
  if (!titleIdRef.current) {
    titleIdRef.current = `modal-title-${++modalCounter}`;
  }

  const getFocusable = useCallback((): HTMLElement[] => {
    const root = panelRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }, []);

  // Guardar el elemento disparador y mover el foco inicial al abrir.
  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Enfocar el primer elemento enfocable, o el panel como fallback.
    const focusables = getFocusable();
    const target = focusables[0] ?? panelRef.current;
    // Enfocar tras el montaje/pintado para asegurar disponibilidad en el DOM.
    const raf = requestAnimationFrame(() => target?.focus());

    return () => {
      cancelAnimationFrame(raf);
      // Retornar el foco al elemento que abrio el modal.
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [open, getFocusable]);

  // Manejo de teclado: Escape para cerrar y Tab para atrapar el foco.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getFocusable();
      if (focusables.length === 0) {
        // Sin elementos enfocables: mantener el foco en el panel.
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === panelRef.current) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose, getFocusable]);

  if (!open) return null;

  const labelledBy = title ? titleIdRef.current : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 lg:items-center"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-card outline-none lg:rounded-2xl ${className}`}
      >
        {(title || showClose) && (
          <header className="mb-4 flex items-start justify-between gap-3">
            {title ? (
              <h2 id={titleIdRef.current} className="text-lg font-extrabold text-slate-900">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-2xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                &times;
              </button>
            )}
          </header>
        )}

        <div className="text-slate-700">{children}</div>

        {footer && <footer className="mt-6 flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}
