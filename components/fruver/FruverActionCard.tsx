import Link from "next/link";
import type { ReactNode } from "react";

interface FruverActionCardProps {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
  external?: boolean;
}

export default function FruverActionCard({ href, title, description, icon, primary = false, external = false }: FruverActionCardProps) {
  const content = (
    <span className={`group flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[var(--fruver-focus)] focus-within:ring-offset-2 ${primary ? "border-[var(--fruver-primary)] bg-[var(--fruver-primary)] text-[var(--fruver-on-primary)] shadow-md" : "border-slate-200 bg-white text-slate-900 shadow-sm hover:border-[var(--fruver-primary)]"}`}>
      <span aria-hidden="true" className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl ${primary ? "bg-white/15" : "bg-[var(--fruver-primary-soft)] text-[var(--fruver-primary)]"}`}>
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
