import { formatCustomFieldValue } from "@/lib/client";

export default function CustomFieldsGrid({
  fields,
  definitions
}: {
  fields: Record<string, any>;
  definitions?: any[];
}) {
  const entries = Object.entries(fields || {});
  if (!entries.length) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => {
        const cfg = (definitions || []).find((c: any) => c.label === key || c.field_name === key);
        const v =
          value && typeof value === "object"
            ? JSON.stringify(value)
            : formatCustomFieldValue(value, cfg?.type || "text");
        return (
          <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              {cfg?.label || key}
            </div>
            <div className="mt-0.5 break-words text-sm font-bold text-slate-800">{v}</div>
          </div>
        );
      })}
    </div>
  );
}