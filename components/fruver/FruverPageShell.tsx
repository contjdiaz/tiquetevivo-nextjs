import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_BRAND_COLOR, normalizeHex, readableTextColor } from "@/lib/fruver/brand";

interface FruverPageShellProps {
  children: ReactNode;
  color?: string | null;
  className?: string;
}

export function getFruverTheme(color?: string | null): CSSProperties {
  const primary = normalizeHex(color) ?? DEFAULT_BRAND_COLOR;
  const onPrimary = readableTextColor(primary);
  return {
    "--fruver-primary": primary,
    "--fruver-on-primary": onPrimary,
    "--fruver-focus": primary,
    "--fruver-primary-soft": `color-mix(in srgb, ${primary} 10%, white)`,
    "--fruver-primary-border": `color-mix(in srgb, ${primary} 30%, white)`,
    "--fruver-primary-strong": `color-mix(in srgb, ${primary} 70%, black)`
  } as CSSProperties;
}

export default function FruverPageShell({ children, color, className = "" }: FruverPageShellProps) {
  return (
    <main
      className={`min-h-screen bg-slate-50 text-slate-900 ${className}`}
      style={getFruverTheme(color)}
    >
      {children}
    </main>
  );
}
