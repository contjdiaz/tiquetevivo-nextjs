"use client";

import { useMemo } from "react";
import Card from "@/components/ui/Card";
import { useOnboardingProgress } from "./useOnboardingProgress";

/**
 * Tareas guiadas de primer uso (Req 12.1, 12.5).
 * Tres acciones clave para que el negocio nuevo empiece a operar:
 * crear el primer tiquete, cambiar el estado de una orden y compartir el
 * enlace por WhatsApp o QR. El progreso se persiste por slug.
 *
 * Las tareas pueden marcarse automaticamente (`done`) cuando el panel detecta
 * que la accion ya ocurrio (p.ej. ya existe al menos una orden), o manualmente.
 */

export type FirstRunTask = {
  id: string;
  label: string;
  hint: string;
  /** Marca la tarea como completada automaticamente (derivado del estado del panel). */
  done?: boolean;
  /** Accion opcional para ejecutar la tarea desde el propio onboarding. */
  onAction?: () => void;
  actionLabel?: string;
};

export default function FirstRunTasks({
  slug,
  tasks,
  onDismiss
}: {
  slug: string;
  tasks: FirstRunTask[];
  onDismiss?: () => void;
}) {
  const { progress, toggle } = useOnboardingProgress("first-run", slug);

  const { done, total } = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done || progress[t.id]).length;
    return { done, total };
  }, [tasks, progress]);

  if (total === 0) return null;
  const allDone = done >= total;

  return (
    <Card emoji="✨" title="Primeros pasos" className="p-5">
      <div className="mb-4 flex items-center justify-between text-sm font-bold text-slate-600">
        <span>
          {done} de {total} completada{done === 1 ? "" : "s"}
        </span>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-xs font-bold text-slate-500 hover:text-slate-800">
            Ocultar
          </button>
        )}
      </div>

      <ol className="space-y-2">
        {tasks.map((t, i) => {
          const checked = Boolean(t.done || progress[t.id]);
          return (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  checked ? "bg-success-500 text-white" : "bg-slate-200 text-slate-600"
                }`}
                aria-hidden="true"
              >
                {checked ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${checked ? "text-slate-400 line-through" : "text-slate-900"}`}>
                  {t.label}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{t.hint}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {t.onAction && !checked && (
                  <button
                    type="button"
                    onClick={t.onAction}
                    className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-brand-700"
                  >
                    {t.actionLabel || "Hacer"}
                  </button>
                )}
                {!t.done && (
                  <button
                    type="button"
                    onClick={() => toggle(t.id, !checked)}
                    aria-label={checked ? "Marcar como pendiente" : "Marcar como completada"}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    {checked ? "Deshacer" : "Marcar"}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <p className="mt-4 rounded-xl bg-success-50 px-3 py-2 text-sm font-bold text-success-700">
          ¡Excelente! Ya conoces lo esencial. 🙌
        </p>
      )}
    </Card>
  );
}
