/**
 * Estado vacío reutilizable (Req 12.3).
 * Muestra un mensaje útil y, opcionalmente, una acción recomendada para que
 * el usuario sepa qué hacer cuando una sección no tiene datos aún.
 */
export default function EmptyState({
  emoji = "📭",
  title,
  hint,
  actionLabel,
  onAction,
  className = ""
}: {
  emoji?: string;
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center ${className}`}
    >
      <div className="text-3xl" aria-hidden="true">
        {emoji}
      </div>
      <p className="mt-2 text-sm font-bold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-700"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
