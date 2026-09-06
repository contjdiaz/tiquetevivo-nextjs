export const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function digitsOnly(value: any): string {
  return String(value || "").replace(/\D/g, "");
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tiquete_auth_token");
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const opts: RequestInit = { ...options };
  if (token) {
    (opts.headers as any) = {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`
    };
  }
  return fetch(url, opts);
}

export async function apiPostJSON(url: string, body: any): Promise<any> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = { error: "Respuesta inválida del servidor" };
  }
  return { ok: res.ok, status: res.status, data };
}

export async function apiGetJSON(url: string): Promise<any> {
  const res = await apiFetch(url);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = { error: "Respuesta inválida del servidor" };
  }
  return { ok: res.ok, status: res.status, data };
}

export function normalizeOrder(order: any): any {
  const customFields: any = { ...(order.custom_fields || {}) };
  if ((order.is_delicate || order.isDelicate) && !customFields.is_delicate) {
    customFields.is_delicate = Boolean(order.is_delicate || order.isDelicate);
  }
  if ((order.rack_location || order.rackLocation) && !customFields.rack_location) {
    customFields.rack_location = order.rack_location || order.rackLocation || "";
  }
  return {
    id: order.id || "",
    order_number: order.order_number || order.orderNumber || order.orderId || "",
    customer_name: order.customer_name || order.customerName || "",
    customer_phone: order.customer_phone || order.customerPhone || "",
    items_text: order.items_text || order.itemsText || "",
    total: Number(order.total || 0),
    paid: Number(order.paid || 0),
    balance:
      typeof order.balance === "number"
        ? order.balance
        : Math.max(0, Number(order.total || 0) - Number(order.paid || 0)),
    status: order.status || "RECEIVED",
    due_date: order.due_date || order.dueDate || "",
    ticket_token: order.ticket_token || order.ticketToken || "",
    created_at: order.created_at || "",
    updated_at: order.updated_at || "",
    slug: order.slug || "",
    custom_fields: customFields,
    intake_photo_url: order.intake_photo_url || order.intakePhotoUrl || null,
    intake_photo_taken_at: order.intake_photo_taken_at || order.intakePhotoTakenAt || null,
    delivery_photo_url: order.delivery_photo_url || order.deliveryPhotoUrl || null,
    delivery_photo_taken_at: order.delivery_photo_taken_at || order.deliveryPhotoTakenAt || null,
    intake_confirmed_at: order.intake_confirmed_at || order.intakeConfirmedAt || null,
    intake_confirmed_ip: order.intake_confirmed_ip || order.intakeConfirmedIp || null,
    delivery_confirmed_at: order.delivery_confirmed_at || order.deliveryConfirmedAt || null,
    delivery_confirmed_ip: order.delivery_confirmed_ip || order.deliveryConfirmedIp || null
  };
}

export function getUnitLabel(unit: string): string {
  switch (unit) {
    case "per_kg": return "/kg";
    case "per_item": return "/und";
    case "per_hour": return "/hr";
    case "flat_rate": return " (tarifa fija)";
    default: return "";
  }
}

export const DEFAULT_PAYMENT_CONFIG = {
  nequi: "310 268 8991",
  daviplata: "310 268 8991",
  bancolombia: "123-456789-01"
};

export function buildPaymentMethodLines(paymentConfig: any): string[] {
  const cfg =
    paymentConfig && Object.keys(paymentConfig).length > 0 ? paymentConfig : DEFAULT_PAYMENT_CONFIG;
  const lines: string[] = [];
  if (cfg.nequi && cfg.daviplata && cfg.nequi === cfg.daviplata) {
    lines.push(`• Nequi / Daviplata: ${cfg.nequi}`);
  } else {
    if (cfg.nequi) lines.push(`• Nequi: ${cfg.nequi}`);
    if (cfg.daviplata) lines.push(`• Daviplata: ${cfg.daviplata}`);
  }
  if (cfg.bancolombia) lines.push(`• Bancolombia Ahorros: ${cfg.bancolombia}`);
  if (cfg.account_holder) lines.push(`• Titular: ${cfg.account_holder}`);
  return lines.length > 0 ? lines : [`• Nequi / Daviplata: ${DEFAULT_PAYMENT_CONFIG.nequi}`];
}

export function buildTicketUrl(orderNumber: string | number, slug: string): string {
  return `${window.location.origin}/tiquete?number=${encodeURIComponent(String(orderNumber))}&slug=${encodeURIComponent(slug)}`;
}

export function compressImage(file: File, maxDimension = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("El archivo no es una imagen"));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = e.target.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function formatCustomFieldValue(value: any, fieldType: string): string {
  if (fieldType === "datetime") {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (fieldType === "date") {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  if (fieldType === "boolean") {
    return value ? "Sí" : "No";
  }
  return String(value);
}

export function detectPaymentReturn(search: string): "success" | "pending" | "failure" | null {
  const params = new URLSearchParams(search);
  const paymentParam = params.get("payment");
  if (!paymentParam) return null;
  const status = (params.get("status") || params.get("transaction_status") || "").toUpperCase();
  if (paymentParam === "complete") {
    if (status === "APPROVED" || status === "APROBADA") return "success";
    if (status === "DECLINED" || status === "RECHAZADA" || status === "VOIDED" || status === "ERROR") return "failure";
    if (status === "PENDING" || status === "PENDIENTE") return "pending";
    return "pending";
  }
  return null;
}