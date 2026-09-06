import { statusToTone, type Tone } from "@/lib/status-tone";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-50 text-success-700 ring-1 ring-inset ring-success-600/20",
  warning: "bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-600/20",
  error: "bg-error-50 text-error-700 ring-1 ring-inset ring-error-600/20",
  info: "bg-info-50 text-info-700 ring-1 ring-inset ring-info-600/20",
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20"
};

export default function StatusTag({
  label,
  statusKey,
  flow,
  className = ""
}: {
  label: string;
  statusKey?: string | null;
  flow?: { status_key: string }[];
  className?: string;
}) {
  const tone = statusToTone(statusKey, flow);
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-extrabold ${toneClasses[tone]} ${className}`}>
      {label}
    </span>
  );
}