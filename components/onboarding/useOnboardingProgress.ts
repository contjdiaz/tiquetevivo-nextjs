"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Progreso de onboarding persistido por negocio (Req 12.5).
 *
 * Se persiste en `localStorage` con clave namespaced por slug para que el
 * progreso sobreviva recargas sin depender de estado volatil. Es una fuente de
 * verdad "cliente" suficiente para el onboarding; si en el futuro se requiere
 * cross-device, puede migrarse a preferencia de usuario en servidor.
 */
export type OnboardingProgress = Record<string, boolean>;

function storageKey(scope: string, slug: string): string {
  return `tv:onboarding:${scope}:${slug || "default"}`;
}

export function useOnboardingProgress(scope: string, slug: string) {
  const [progress, setProgress] = useState<OnboardingProgress>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(scope, slug));
      setProgress(raw ? (JSON.parse(raw) as OnboardingProgress) : {});
    } catch {
      setProgress({});
    }
    setLoaded(true);
  }, [scope, slug]);

  const persist = useCallback(
    (next: OnboardingProgress) => {
      setProgress(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey(scope, slug), JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible: se mantiene solo en memoria */
      }
    },
    [scope, slug]
  );

  const toggle = useCallback(
    (id: string, value?: boolean) => {
      setProgress((prev) => {
        const next = { ...prev, [id]: value ?? !prev[id] };
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey(scope, slug), JSON.stringify(next));
          } catch {
            /* noop */
          }
        }
        return next;
      });
    },
    [scope, slug]
  );

  const reset = useCallback(() => persist({}), [persist]);

  return { progress, loaded, toggle, persist, reset };
}
