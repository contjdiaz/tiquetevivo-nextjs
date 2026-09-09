import type { CSSProperties } from "react";
import { getFruverTheme } from "./FruverPageShell";

interface FruverBrandHeaderProps {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
  eyebrow?: string;
  compact?: boolean;
}

export default function FruverBrandHeader({ name, logoUrl, color, eyebrow = "Centro de pedidos y entregas", compact = false }: FruverBrandHeaderProps) {
  const theme = getFruverTheme(color);

  return (
    <header
      className={`relative overflow-hidden px-5 text-[var(--fruver-on-primary)] sm:px-6 ${compact ? "py-7" : "py-9"}`}
      style={{ ...theme, backgroundColor: "var(--fruver-primary)" } as CSSProperties}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/3 h-36 w-36 rounded-full bg-white/10" />
      <div className="relative mx-auto flex max-w-5xl items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className={`${compact ? "h-14 w-14" : "h-16 w-16"} shrink-0 rounded-2xl border border-white/50 bg-white object-contain p-1.5 shadow-lg`} />
        ) : (
          <div aria-hidden="true" className={`${compact ? "h-14 w-14 text-2xl" : "h-16 w-16 text-3xl"} grid shrink-0 place-items-center rounded-2xl border border-white/40 bg-white/15 shadow-lg`}>
            🛒
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">{eyebrow}</p>
          <h1 className={`${compact ? "text-xl" : "text-2xl"} mt-1 break-words font-extrabold leading-tight`}>{name}</h1>
        </div>
      </div>
    </header>
  );
}
