import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_BRAND_COLOR, getVerticalTheme } from "@/lib/fruver/brand";

interface FruverPageShellProps {
  children: ReactNode;
  color?: string | null;
  className?: string;
}

export function getFruverTheme(color?: string | null): CSSProperties {
  return getVerticalTheme(color, DEFAULT_BRAND_COLOR);
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