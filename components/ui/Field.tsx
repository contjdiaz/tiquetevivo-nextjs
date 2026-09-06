export const inputCls =
  "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

export default function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return <label className="block">{label}{required && <span className="text-error-600"> *</span>}{children}</label>;
}