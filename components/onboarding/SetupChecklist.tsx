"use client";

import { useMemo } from "react";
import Card from "@/components/ui/Card";
import { useOnboardingProgress } from "./useOnboardingProgress";

/**
 * Checklist de configuracion inicial post-registro (Req 12.2, 12.5).
 * Guia al negocio nuevo por los pasos clave: logo, metodos de pago,
 * tiquete demo, mensajes de WhatsApp y login. El progreso se persiste por slug.
 */

export type SetupItem = {
  id: string;
  label: string;
  hint: string;
  /** Si esta true, el item se marca como completado automaticamente (derivado de config). */
  autoDone?: boolean;
};

const DEFAULT_ITEMS: SetupItem[] = [
  { id: "logo", label: "Sube el logo de tu negocio", hint: "Aparece en el tiquete y refuerza tu marca." },
  { id: "payment", label: "Configura tus métodos de pago", hint: "Nequi, Daviplata o Bancolombia para recibir saldos." },
  { id: "demo_ticket", label: "Crea un tiquete de prueba", hint: "Verás cómo lo recibe tu cliente antes de operar en real." },
  { id: "whatsapp", label: "Revisa los mensajes de WhatsApp", hint: "Personaliza el texto que se envía en cada estado." },
  { id: "login", label: "Prueba el inicio de sesión", hint: "Confirma que tu equipo puede entrar al panel." }
];

export default function SetupChecklist({
  slug,
  items = DEFAULT_ITEMS,
  onDismiss
}: {
  slug: string;
  items?: SetupItem[];
  onDismiss?: () => void;
}) {
  const { progress, toggle } = useOnboardingProgress("setup", slug);

  const { done, total } = useMemo(() => {
    const total = items.length;
    const done = items.filter((it) => it.autoDone || progress[it.id]).length;
    return { done, total };
  }, [items, progress]);

  const allDone = done >= total;

  return (
    <Card emoji="🚀" title="Configura tu negocio" className="p-5">
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm font-bold text-slate-600">
          <span>
            {done} de {total} completado{done === 1 ? "" : "s"}
          </span>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              Ocultar
            </button>
          )}
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Progreso de configuración inicial"
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
          />
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((it) => {
          const checked = Boolean(it.autoDone || progress[it.id]);
          return (
            <li key={it.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-brand-600"
                  checked={checked}
                  disabled={it.autoDone}
                  onChange={(e) => toggle(it.id, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${checked ? "text-slate-400 line-through" : "text-slate-900"}`}>
                    {it.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{it.hint}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {allDone && (
        <p className="mt-4 rounded-xl bg-success-50 px-3 py-2 text-sm font-bold text-success-700">
          ¡Listo! Tu negocio está configurado. 🎉
        </p>
      )}
    </Card>
  );
}
