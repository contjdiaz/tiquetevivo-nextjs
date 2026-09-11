import Link from "next/link";
import type { ReactNode } from "react";

interface VerticalActionCardProps {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
  external?: boolean;
}

/**
 * Generic CTA card for a vertical public page. Uses the shared `--brand-*`
 * theme tokens with the `--brand-focus` ring for visible keyboard focus.
 */
export default function VerticalActionCard({ href, title, description, icon, primary = false, external = false }: VerticalActionCardProps) {
  const content = (
    <span className={`group flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[var(--brand-focus)] focus-within:ring-offset-2 ${primary ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[var(--brand-on-primary)] shadow-md" : "border-slate-200 bg-white text-slate-900 shadow-sm hover:border-[var(--brand-primary)]"}`}>
      <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl ${primary ? "bg-white/15" : "bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-extrabold">
          {title}
          {external && <span aria-hidden="true" className="text-xs opacity-70">↗</span>}
        </span>
        <span className={`mt-1 block text-sm leading-relaxed ${primary ? "opacity-85" : "text-slate-500"}`}>{description}</span>
      </span>
      <span aria-hidden="true" className="mt-1 text-lg opacity-50 transition-transform group-hover:translate-x-0.5">→</span>
    </span>
  );

  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${title}, abre en una nueva pestaña`} className="block rounded-2xl focus:outline-none">{content}</a>;
  }
  return <Link href={href} className="block rounded-2xl focus:outline-none">{content}</Link>;
}