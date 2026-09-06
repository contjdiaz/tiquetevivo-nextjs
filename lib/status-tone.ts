export type Tone = "success" | "warning" | "error" | "info" | "neutral";

export function statusToTone(statusKey: string | null | undefined, flow?: { status_key: string }[]): Tone {
  const key = String(statusKey || "").toUpperCase();
  if (!key) return "neutral";
  if (key === "CANCELLED" || key === "CANCELADO" || key.includes("CANCEL") || key.includes("REJECT") || key.includes("VOID")) {
    return "error";
  }
  if (key === "PAID" || key === "PAGADO" || key.includes("COMPLET")) {
    return "success";
  }
  if (key.includes("PEND") || key.includes("BALANCE") || key === "SALDO" || key === "OWED") {
    return "warning";
  }
  if (key.includes("READY") || key.includes("LISTO") || key.includes("FINALIZ")) {
    return "success";
  }
  if (key.includes("DELIVER") || key.includes("ENTREG")) {
    return "success";
  }
  if (key.includes("IN_PROGRESS") || key.includes("PROCESS") || key.includes("PREPAR")) {
    return "warning";
  }
  if (key.includes("RECEIV") || key.includes("RECIB")) {
    return "info";
  }
  if (flow && flow.length) {
    const last = flow[flow.length - 1]?.status_key;
    if (last && last.toUpperCase() === key) return "success";
  }
  return "info";
}