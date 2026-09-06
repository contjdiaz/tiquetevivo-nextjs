import { money } from "@/lib/client";

export default function BalanceBanner({ balance }: { balance: number }) {
  const owed = Number(balance || 0) > 0;
  return (
    <div
      className={`mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 ${
        owed ? "border-warning-200 bg-warning-50" : "border-success-200 bg-success-50"
      }`}
    >
      <span className="text-2xl">{owed ? "💰" : "✅"}</span>
      <div>
        <div className={`text-xs font-extrabold uppercase tracking-wide ${owed ? "text-warning-700" : "text-success-700"}`}>
          {owed ? "Saldo pendiente" : "Cuenta saldada"}
        </div>
        <div className={`text-xl font-extrabold ${owed ? "text-warning-800" : "text-success-800"}`}>
          {owed ? money.format(balance) : "Pagado ✓"}
        </div>
      </div>
    </div>
  );
}