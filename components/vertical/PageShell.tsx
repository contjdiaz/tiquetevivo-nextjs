import type { CSSProperties, ReactNode } from "react";
import {
  DEFAULT_BRAND_COLOR,
  getVerticalTheme,
} from "@/lib/vertical/brand";

interface VerticalPageShellProps {
  children: ReactNode;
  color?: string | null;
  defaultColor?: string;
  className?: string;
}

/**
 * Generic page canvas for a vertical public page. Applies the brand theme
 * (both `--brand-*` and `--fruver-*` tokens) on a light slate canvas.
 */
export default function VerticalPageShell({
  children,
  color,
  defaultColor = DEFAULT_BRAND_COLOR,
  className = "",
}: VerticalPageShellProps) {
  return (
    <main
      className={`min-h-screen bg-slate-50 text-slate-900 ${className}`}
      style={getVerticalTheme(color, defaultColor) as CSSProperties}
    >
      {children}
    </main>
  );
}