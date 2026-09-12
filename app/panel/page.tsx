"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import QuoteModal from "@/components/ui/QuoteModal";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import SetupChecklist from "@/components/onboarding/SetupChecklist";
import FirstRunTasks, { type FirstRunTask } from "@/components/onboarding/FirstRunTasks";
import { useBrandTheme } from "@/lib/brand-theme";
import { isFruverVertical } from "@/lib/fruver/vertical";
import { isLavanderiaVertical } from "@/lib/lavanderia/vertical";
import FruverPanel from "./fruver/FruverPanel";
import LavanderiaPanel from "./lavanderia/LavanderiaPanel";
import QrModal from "./components/QrModal";
import DeliveryPhotoModal from "./components/DeliveryPhotoModal";
import DeliveryLinkModal from "./components/DeliveryLinkModal";
import ScannerModal from "./components/ScannerModal";
import CouponPanel from "./components/CouponPanel";
import { Receipt, OrdersTable, OrderCards, KanbanBoard } from "./components/OrdersViews";
import {
  apiFetch,
  apiGetJSON,
  apiPostJSON,
  compressImage,
  digitsOnly,
  getStoredToken,
  money,
  normalizeOrder
} from "@/lib/client";
import type { BusinessConfig } from "@/lib/types/domain";
import {
  FALLBACK_CONFIG,
  buildWaLink,
  buildWhatsAppMessage,
  findReadyStatus,
  getStatusLabels,
  isDeliveredStatus
} from "./lib/helpers";

// ─── Login overlay ─────────────────────────────────────────────────────

function LoginOverlay({ onLogin, error }: { onLogin: (e: React.FormEvent) => void; error: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 p-5">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <h2 className="text-xl font-extrabold text-slate-900">🔐 Acceso al panel</h2>
        <p className="mt-1 text-sm text-slate-600">Ingresa tus credenciales de operador para continuar.</p>
        <form onSubmit={onLogin} className="mt-4">
          <label className="block text-sm font-bold text-slate-700">
            Correo electrónico
            <input id="loginEmail" type="email" required placeholder="operador@negocio.com"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2" />
          </label>
          <label className="mt-3 block text-sm font-bold text-slate-700">
            Contraseña
            <input id="loginPassword" type="password" required placeholder="••••••••"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2" />
          </label>
          {error && <p className="mt-2 text-sm font-bold text-error-700">{error}</p>}
          <button type="submit" className="mt-4 w-full rounded-md bg-brand-600 py-3 font-extrabold text-white hover:bg-brand-700">
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Order Form ───────────────────────────────────────────────────────

interface FormState {
  serviceType: string;
  templateName: string;
  customerName: string;
  customerPhone: string;
  itemsText: string;
  total: string;
  paid: string;
  status: string;
  dueDate: string;
  intakeConfirmed: boolean;
  intakePhoto: string | null;
  customFields: Record<string, any>;
}

const EMPTY_FORM: FormState = {
  serviceType: "",
  templateName: "default",
  customerName: "",
  customerPhone: "",
  itemsText: "",
  total: "",
  paid: "",
  status: "",
  dueDate: "",
  intakeConfirmed: false,
  intakePhoto: null,
  customFields: {}
};

function ServiceDetailFields({ unit, defaultPrice, total, itemsText, setTotal, setItemsText }: {
  unit: string; defaultPrice: number; total: string; itemsText: string;
  setTotal: (v: string) => void; setItemsText: (v: string) => void;
}) {
  const [qty, setQty] = useState(unit === "per_kg" ? "10" : "1");
  const [unitPrice, setUnitPrice] = useState(String(defaultPrice || (unit === "per_kg" ? 4500 : unit === "per_item" ? 8000 : 12000)));
  const serviceNameRef = useRef<string>("");

  useEffect(() => {
    setUnitPrice(String(defaultPrice || 0));
    if (unit !== "per_kg" && unit !== "per_item" && unit !== "per_hour") return;
    recalc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, defaultPrice]);

  function recalc(guessName?: string) {
    const q = parseFloat(qty) || 0;
    const p = parseFloat(unitPrice) || 0;
    setTotal(String(Math.round(q * p)));
    if (unit === "per_kg") setItemsText(`${guessName || "Servicio"}: ${q} kg a ${money.format(p)}/kg`);
    else if (unit === "per_item") setItemsText(`${guessName || "Servicio"}: ${q} prenda(s) a ${money.format(p)}/und`);
    else if (unit === "per_hour") setItemsText(`${guessName || "Servicio"}: ${q} hr(s) a ${money.format(p)}/hr`);
  }

  if (!unit || unit === "flat_rate") return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg border border-success-200 bg-success-50 p-3">
      <label className="block text-xs font-bold text-slate-700">
        {unit === "per_kg" ? "Kilos (Kg)" : unit === "per_item" ? "Cantidad de prendas" : "Horas"}
        <input type="number" step={unit === "per_kg" ? 0.1 : unit === "per_hour" ? 0.5 : 1} min={0} value={qty}
          onChange={(e) => { setQty(e.target.value); recalc(); }} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5" />
      </label>
      <label className="block text-xs font-bold text-slate-700">
        {unit === "per_kg" ? "Tarifa / Kg" : unit === "per_item" ? "Precio por prenda" : "Tarifa / Hora"}
        <input type="number" min={0} value={unitPrice}
          onChange={(e) => { setUnitPrice(e.target.value); recalc(); }} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5" />
      </label>
    </div>
  );
}

function OrderForm({ config, slug, onCreated, toastFn }: {
  config: BusinessConfig; slug: string; onCreated: (order: any, waLink: string, liveUrl: string, message: string) => void; toastFn: (m: string) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const paid = config.plan === "paid";
  const services = (config.services_config || []).filter((s: any) => s.active !== false);
  const stateLabels = getStatusLabels(config);
  const statusKeys = [...(config.status_flow_config || []).map((s: any) => s.status_key)];
  // Detecta el vertical para adaptar plantillas y textos del formulario, en
  // lugar de mostrar los valores de lavandería (Maktub) por defecto.
  const isFruver = isFruverVertical({ verticalName: config.vertical_name, businessSlug: config.business_slug });
  const detailPlaceholder = isFruver ? "Ej: 2 kg tomate, 1 lechuga, 3 bananos" : "Ej: 1 sábana, 2 camisas";

  const selectedService = services.find((s: any) => s.name === form.serviceType);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      itemsText: form.itemsText.trim(),
      total: Number(form.total) || 0,
      paid: Number(form.paid) || 0,
      status: form.status || statusKeys[0] || "RECEIVED",
      slug,
      orderNumber: String(Date.now()).slice(-6),
      templateName: form.templateName,
      custom_fields: { ...form.customFields }
    };
    if (selectedService) payload.custom_fields.service_type = selectedService.name;
    if (form.dueDate) payload.dueDate = form.dueDate;
    if (form.intakeConfirmed) payload.intakeConfirmed = true;
    if (form.intakePhoto) payload.intakePhoto = form.intakePhoto;

    let order: any;
    try {
      const res = await apiPostJSON("/api/create-order", payload);
      if (!res.ok) throw new Error(res.data?.message || "No se pudo guardar");
      order = res.data;
      toastFn("Tiquete guardado en la nube");
    } catch (err: any) {
      order = { ...payload, id: "demo-" + Date.now(), order_number: payload.orderNumber, balance: Math.max(0, payload.total - payload.paid), status: payload.status };
      toastFn(err.message || "Pedido guardado localmente.");
    }
    const normalized = normalizeOrder(order);
    const waLink = buildWaLink(normalized, form.templateName, config, slug);
    const liveUrl = `${window.location.origin}/tiquete?number=${encodeURIComponent(normalized.order_number)}&slug=${encodeURIComponent(slug)}`;
    const message = buildWhatsAppMessage(normalized, form.templateName, config, slug);
    onCreated(normalized, waLink, liveUrl, message);

    setForm(EMPTY_FORM);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* El selector de servicios solo aplica a verticales con servicios
          configurados (p. ej. lavandería). En fruver el detalle es libre y los
          productos se manejan por cotización, así que se oculta si no hay. */}
      {services.length > 0 && (
        <label className="block text-sm font-bold text-slate-700">
          Tipo de Servicio
          <select className="input" value={form.serviceType}
            onChange={(e) => {
              const name = e.target.value;
              if (name === "") { set("serviceType", ""); return; }
              const svc = services.find((s: any) => s.name === name);
              set("serviceType", name);
              if (svc && svc.default_price) set("total", String(svc.default_price));
            }}>
            <option value="">Selecciona...</option>
            {services.map((s: any) => (
              <option key={s.name} value={s.name}>
                {s.name}{s.default_price ? ` - ${money.format(s.default_price)}${s.unit === "per_kg" ? "/kg" : s.unit === "per_item" ? "/und" : s.unit === "per_hour" ? "/hr" : ""}` : ""}
              </option>
            ))}
          </select>
          {selectedService?.description && (
            <small className="block text-[11px] font-semibold text-slate-500">ℹ️ {selectedService.description}</small>
          )}
        </label>
      )}

      <label className="block text-sm font-bold text-slate-700">
        Plantilla WhatsApp
        <select className="input" value={form.templateName} onChange={(e) => set("templateName", e.target.value)}>
          {isFruver ? (
            <>
              <option value="default">🥬 Recibo del Pedido + Tiquete Digital</option>
              <option value="maktub_en_entrega">🛵 En Camino a Domicilio</option>
              <option value="maktub_cobro">💸 Recordatorio de Cobro</option>
            </>
          ) : (
            <>
              <option value="default">🐧 Recibo Estándar + Tiquete Digital</option>
              <option value="maktub_recogida">🚚 Recogida a Domicilio</option>
              <option value="maktub_en_entrega">🛵 En Camino a Domicilio</option>
              <option value="maktub_remision_b2b">🏨 Remisión B2B (Por Kilos)</option>
              <option value="maktub_cobro">💸 Recordatorio de Cobro</option>
            </>
          )}
        </select>
      </label>

      <label className="block text-sm font-bold text-slate-700">
        Cliente
        <input className="input" value={form.customerName} required placeholder="Nombre del cliente" onChange={(e) => set("customerName", e.target.value)} />
      </label>
      <label className="block text-sm font-bold text-slate-700">
        WhatsApp
        <input className="input" value={form.customerPhone} required type="tel" placeholder="+57 310 268 8991" onChange={(e) => set("customerPhone", e.target.value.replace(/[^\d+]/g, ""))} />
      </label>

      {selectedService && (
        <div key={selectedService.name}>
          <ServiceDetailFields
            unit={selectedService.unit}
            defaultPrice={Number(selectedService.default_price) || 0}
            total={form.total}
            itemsText={form.itemsText}
            setTotal={(v) => set("total", v)}
            setItemsText={(v) => set("itemsText", v)}
          />
        </div>
      )}

      <label className="block text-sm font-bold text-slate-700">
        Detalle
        <textarea className="input" rows={2} required value={form.itemsText} placeholder={detailPlaceholder} onChange={(e) => set("itemsText", e.target.value)} />
      </label>

      {paid && (
        <label className="block text-sm font-bold text-slate-700">
          Evidencia fotográfica al recibir
          {form.intakePhoto ? (
            <span className="relative mt-1 block">
              <img src={form.intakePhoto} alt="Vista previa" className="max-h-40 w-full rounded-lg object-cover" />
              <button type="button" aria-label="Quitar foto" className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-slate-900/70 text-white" onClick={() => set("intakePhoto", null)}><span aria-hidden="true">✕</span></button>
            </span>
          ) : (
            <label className="mt-1 block cursor-pointer rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-500">
              📸 Tomar foto / Elegir imagen
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) set("intakePhoto", await compressImage(file, 800, 0.8));
                  e.target.value = "";
                }} />
            </label>
          )}
          <small className="block text-[11px] text-slate-500">La imagen se comprime a ~800 px.</small>
        </label>
      )}
      {!paid && (
        <small className="block text-xs font-bold text-warning-700">⭐ Actualiza al plan pago para activar evidencia fotográfica y confirmaciones digitales.</small>
      )}

      <label className="flex cursor-pointer items-start gap-2 text-sm font-bold text-slate-700">
        <input type="checkbox" checked={form.intakeConfirmed} disabled={!paid}
          onChange={(e) => set("intakeConfirmed", e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
        <span>
          ✅ Cliente confirma recepción conforme
          <small className="block text-[11px] font-semibold text-slate-500">Deja constancia digital de que el cliente revisó y aceptó las prendas al entregarlas. Útil ante reclamos.</small>
        </span>
      </label>

      {(config.custom_fields_config || []).length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {(config.custom_fields_config || []).map((def: any) => {
            const val = form.customFields[def.field_key];
            return def.field_type === "boolean" ? (
              <label key={def.field_key} className="col-span-2 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={Boolean(val)} onChange={(e) => set("customFields", { ...form.customFields, [def.field_key]: e.target.checked })} className="h-4 w-4 accent-brand-600" />
                {def.display_label}
              </label>
            ) : (
              <label key={def.field_key} className="block text-sm font-bold text-slate-700">
                {def.display_label}
                {def.field_type === "select" ? (
                  <select className="input" value={val || ""} onChange={(e) => set("customFields", { ...form.customFields, [def.field_key]: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {(def.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    className="input"
                    type={def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : def.field_type === "datetime" ? "datetime-local" : def.field_type === "time" ? "time" : "text"}
                    value={val ?? ""}
                    onChange={(e) => set("customFields", { ...form.customFields, [def.field_key]: e.target.value })}
                  />
                )}
              </label>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-extrabold text-slate-800">
          Total a pagar
          <input className="input text-lg font-extrabold" type="number" min={0} required value={form.total} onChange={(e) => set("total", e.target.value)} />
          <small className="block text-[11px] font-semibold text-slate-500">Valor total del servicio, incluyendo todos los ítems.</small>
        </label>
        <label className="block text-sm font-bold text-slate-700">
          Abono
          <input className="input" type="number" min={0} required value={form.paid} onChange={(e) => set("paid", e.target.value)} />
          <small className="block text-[11px] font-semibold text-slate-500">Lo que el cliente paga ahora. Déjalo en 0 si paga todo al recoger.</small>
        </label>
      </div>
      {/* Saldo derivado (Total − Abono): ayuda a evitar errores de cobro (Req 12.4). */}
      {(() => {
        const totalNum = Number(form.total) || 0;
        const paidNum = Number(form.paid) || 0;
        const balance = totalNum - paidNum;
        const overpaid = balance < 0;
        return (
          <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${overpaid ? "border-error-200 bg-error-50 text-error-700" : balance === 0 ? "border-success-200 bg-success-50 text-success-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            <span>Saldo pendiente</span>
            <span>{money.format(Math.max(0, balance))}{overpaid ? " · el abono supera el total" : balance === 0 ? " · pagado completo" : ""}</span>
          </div>
        );
      })()}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-bold text-slate-700">
          Estado
          <select className="input" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {statusKeys.map((k) => <option key={k} value={k}>{stateLabels[k] || k}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-700">
          Entrega
          <input className="input" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          <small className="block text-[11px] font-semibold text-slate-500">Fecha prometida de entrega. El cliente la ve en su tiquete.</small>
        </label>
      </div>

      <Button type="submit" variant="primary" rounded="lg" className="mt-1 w-full px-4 py-3">
        ✅ Crear Tiquete y Abrir WhatsApp
      </Button>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────

function PanelInner() {
  const params = useSearchParams();
  const initialSlug = params.get("slug") || "majesty";
  const hasSlugParam = params.has("slug");

  const [slug, setSlug] = useState(initialSlug);
  const [config, setConfig] = useState<BusinessConfig>({ ...FALLBACK_CONFIG });
  const [orders, setOrders] = useState<any[]>(JSON.parse(typeof window === "undefined" ? "null" : (localStorage.getItem("tiquete_orders") || "null")) || []);
  const [loyalty, setLoyalty] = useState<Record<string, any>>({});
  const [loginVisible, setLoginVisible] = useState(!getStoredToken());
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loginError, setLoginError] = useState("");
  const [dataStatus, setDataStatus] = useState("Demo activa");
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<number | null>(null);

  useBrandTheme(config.business_color || null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"table" | "kanban">("table");
  // Top-level panel tab. The "Fruver" tab only appears for fruver businesses.
  const [panelTab, setPanelTab] = useState<"orders" | "fruver" | "lavanderia">("orders");
  const [currentPage, setCurrentPage] = useState(1);
  // Default to 25 on the server (no localStorage during SSR); the stored
  // preference is hydrated on the client in the effect below.
  const [pageSize, setPageSizeState] = useState<number>(25);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = parseInt(window.localStorage.getItem("tiquete_page_size") || "25", 10);
    if ([10, 25, 50, 100].includes(stored)) setPageSizeState(stored);
  }, []);

  const [qrOrder, setQrOrder] = useState<any>(null);
  const [deliveryPhotoFor, setDeliveryPhotoFor] = useState<any>(null);
  const [deliveryLinkOrder, setDeliveryLinkOrder] = useState<any>(null);
  const [quoteOrder, setQuoteOrder] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ order: any; waLink: string; liveUrl: string; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Onboarding (Req 12): se muestra para negocios recien registrados (`?new=1`)
  // o mientras el usuario no lo oculte. El estado de "ocultado" se persiste por
  // slug para no reaparecer en cada carga.
  const isNewBusiness = params.get("new") === "1";
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(`tv:onboarding:dismissed:${slug}`) === "1";
    setOnboardingDismissed(dismissed && !isNewBusiness);
  }, [slug, isNewBusiness]);

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`tv:onboarding:dismissed:${slug}`, "1");
      } catch {
        /* noop */
      }
    }
  }, [slug]);

  function toast(message: string) {
    setToastMsg(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(""), 2800);
  }

  const refreshOrders = useCallback(async () => {
    if (!getStoredToken()) return;
    try {
      const res = await apiGetJSON(`/api/list-orders?slug=${encodeURIComponent(slug)}&include_loyalty=1`);
      if (!res.ok) throw new Error("No se pudo conectar. Seguimos en modo demo.");
      const ordersData: any[] = res.data.orders || [];
      setOrders(ordersData.map(normalizeOrder));
      setLoyalty(res.data.loyalty_summaries || {});
      localStorage.setItem("tiquete_orders", JSON.stringify(ordersData.map(normalizeOrder)));
      setDataStatus("Guardado en la nube");
      toast("Pedidos actualizados");
    } catch (err: any) {
      setDataStatus("Demo activa");
      toast(err.message || "Error de conexión");
    }
  }, [slug]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiGetJSON(`/api/get-business-config?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Config fetch failed");
      const cfg = { ...FALLBACK_CONFIG, ...res.data };
      setConfig(cfg);
      setDataStatus("Guardado en la nube");
    } catch {
      setConfig({ ...FALLBACK_CONFIG });
    }
  }, [slug]);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setLoginVisible(false);
      fetchConfig().then(refreshOrders);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const email = (document.getElementById("loginEmail") as HTMLInputElement).value.trim();
    const password = (document.getElementById("loginPassword") as HTMLInputElement).value;
    setLoginError("");
    try {
      const res = await apiPostJSON("/api/auth-login", { email, password });
      if (!res.ok) throw new Error(res.data?.message || "Credenciales inválidas");
      localStorage.setItem("tiquete_auth_token", res.data.token);
      setCurrentUser(res.data.user || null);
      setLoginVisible(false);
      await fetchConfig();
      await refreshOrders();
    } catch (err: any) {
      setLoginError(err.message || "No se pudo iniciar sesión");
    }
  }

  function handleLogout() {
    localStorage.removeItem("tiquete_auth_token");
    setCurrentUser(null);
    setLoginVisible(true);
  }

  async function handleChangeStatus(order: any, newStatus: string) {
    if (order.id.startsWith("demo-")) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o)));
      setDeliveryPhotoFor(null);
      toast("Estado actualizado localmente");
      return;
    }
    if (isDeliveredStatus(newStatus, config)) {
      if (config.plan !== "paid") {
        await doChangeOrderStatus(order.id, newStatus, null);
        return;
      }
      setDeliveryPhotoFor({ order, newStatus });
      return;
    }
    await doChangeOrderStatus(order.id, newStatus, null);
  }

  async function doChangeOrderStatus(orderId: string, newStatus: string, deliveryPhoto: string | null) {
    try {
      const payload: any = { id: orderId, status: newStatus, slug };
      if (deliveryPhoto) payload.deliveryPhoto = deliveryPhoto;
      const res = await apiFetch("/api/update-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Error al actualizar estado");
      }
      const updated = await res.json();
      setOrders((prev) => {
        const nextOrders = prev.map((o) => (o.id === orderId ? normalizeOrder(updated) : o));
        try { localStorage.setItem("tiquete_orders", JSON.stringify(nextOrders)); } catch { /* ignore */ }
        return nextOrders;
      });
      toast("Estado actualizado en la nube");
      // Tras la mutacion, recargar desde servidor para que sea la fuente de verdad
      // e invalidar cache local obsoleta (Req 7.3, 7.4).
      taskRefreshOrders();
    } catch (err: any) {
      toast(err.message || "Error al actualizar estado");
    }
  }

  async function openDeliveryLinkFor(order: any) {
    setDeliveryLinkOrder(order);
  }

  function requestApproval(order: any) {
    if (!config.business_id) {
      toast("Configuración del negocio no disponible");
      return;
    }
    // Abrir el modal de cotización (reemplaza window.prompt, Req 10.1).
    setQuoteOrder(order);
  }

  async function submitQuote(amount: number, description: string) {
    const order = quoteOrder;
    if (!order || !config.business_id) {
      setQuoteOrder(null);
      return;
    }
    setQuoteOrder(null);
    const res = await apiPostJSON("/api/approval-decide", {
      action: "generate",
      order_id: order.id,
      business_id: config.business_id,
      amount,
      description
    });
    if (!res.ok) {
      toast(res.data?.message || res.data?.error || "Error al solicitar aprobación");
      return;
    }
    toast("Cotización enviada por WhatsApp. Link copiado al portapapeles.");
    try {
      await navigator.clipboard.writeText(res.data.approval_link || "");
    } catch { /* ignore */ }
    // Recargar desde servidor como fuente de verdad tras la mutacion (Req 7.3, 7.4).
    taskRefreshOrders();
  }

  function handleScanned(payload: string) {
    setScannerOpen(false);
    const m = payload.match(/\/tiquete[^?#]*\?[^#]*number=([^&]+)/i) || payload.match(/number=([^&\s]+)/i);
    const detectedNumber = m ? decodeURIComponent(m[1]) : payload.trim().replace(/^#/, "");
    if (detectedNumber) {
      setSearch(detectedNumber);
      const found = orders.find((o) => String(o.order_number) === String(detectedNumber));
      if (found) {
        setQrOrder(found);
        toast(`Tiquete #${detectedNumber} encontrado`);
      } else {
        toast(`No encontrado: #${detectedNumber}. Busca un poco...`);
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cashReport() {
    const today = new Date().toLocaleDateString("es-CO");
    const businessName = config.business_name || "TiqueteVivo";
    const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalPaid = orders.reduce((s, o) => s + Number(o.paid || 0), 0);
    const totalBalance = orders.reduce((s, o) => s + Number(o.balance || 0), 0);
    const readyStatusKey = findReadyStatus(config);
    const readyCount = orders.filter((o) => o.status === readyStatusKey).length;
    const reportText = [
      `📊 *CIERRE DE CAJA DIARIA — ${businessName}*`,
      `📅 Fecha: ${today}`,
      `----------------------------------------`,
      `📥 Total pedidos creados: ${orders.length}`,
      `💰 Ventas totales: ${money.format(totalSales)}`,
      `💵 Ingresado a Caja (Abonos): ${money.format(totalPaid)}`,
      `💸 Saldos por cobrar: ${money.format(totalBalance)}`,
      `✅ Pedidos listos para entregar: ${readyCount}`,
      `----------------------------------------`,
      `🌱 *Operación 100% Digital y Cero Papel*`
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank", "noopener");
    toast("Reporte de Cierre de Caja generado para WhatsApp");
  }

  function onOrderCreated(order: any, waLink: string, liveUrl: string, message: string) {
    setOrders((prev) => {
      const nextOrders = [order, ...prev];
      try { localStorage.setItem("tiquete_orders", JSON.stringify(nextOrders)); } catch { /* ignore */ }
      return nextOrders;
    });
    setReceipt({ order, waLink, liveUrl, message });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    taskRefreshOrders();
  }

  function taskRefreshOrders() {
    if (getStoredToken()) {
      refreshOrders();
    }
  }

  // Derived: filtered + paginated
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter((o) =>
      (!statusFilter || o.status === statusFilter) &&
      (`${o.order_number} ${o.customer_name} ${o.items_text} ${o.custom_fields?.rack_location || ""}`.toLowerCase().includes(q))
    );
  }, [orders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageOrders = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  function resetPage() { setCurrentPage(1); }

  // Detect the vertical of the active business from the loaded config to gate
  // the vertical sub-panels (Fruver / Lavandería). If the active business has
  // no vertical tab, force the tab back to orders so a stale selection never
  // hides the orders view.
  const isFruver = isFruverVertical({
    verticalName: config.vertical_name,
    businessSlug: config.business_slug || slug
  });
  const isLavanderia = isLavanderiaVertical({
    verticalName: config.vertical_name,
    businessSlug: config.business_slug || slug
  });
  const verticalPanelKey = isFruver ? "fruver" : isLavanderia ? "lavanderia" : null;
  const activePanelTab = verticalPanelKey === panelTab ? panelTab : verticalPanelKey ?? "orders";

  function changeSlug(newSlug: string) {
    if (!newSlug) return;
    window.location.href = `/panel?slug=${encodeURIComponent(newSlug)}`;
  }

  const businesses = useBusinessList(slug, config, hasSlugParam);

  return (
    <main className="min-h-screen bg-slate-50">
      {loginVisible && <LoginOverlay onLogin={handleLogin} error={loginError} />}

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden max-h-screen w-[260px] flex-col justify-between overflow-auto border-r border-white/5 bg-gradient-to-b from-slate-900 to-slate-800 p-6 text-white lg:flex">
          <div>
            <div className="mb-7 flex items-center gap-3 text-lg font-extrabold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 font-black">TV</span>
              TiqueteVivo
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-xs font-bold uppercase text-slate-300">Negocio activo</label>
              <select value={slug} onChange={(e) => changeSlug(e.target.value)} disabled={hasSlugParam}
                className="w-full rounded-md border border-white/10 bg-transparent px-3 py-2 font-bold text-white disabled:opacity-60">
                <option value="" className="text-slate-900">Cargando…</option>
                {businesses.map((b: any) => (
                  <option key={b.slug} value={b.slug} className="text-slate-900">
                    {b.vertical_emoji || ""} {b.name}
                  </option>
                ))}
              </select>
            </div>
            <nav className="grid gap-2 text-sm">
              <span className="rounded-md bg-slate-800/30 px-3 py-2 font-bold text-white">📋 Pedidos</span>
              <span className="rounded-md px-3 py-2 font-bold text-slate-400" title="Próximamente">💰 Caja</span>
              <span className="rounded-md px-3 py-2 font-bold text-slate-400" title="Próximamente">👥 Clientes</span>
              <Link href="/registro" className="rounded-md px-3 py-2 font-bold text-slate-400 hover:text-white">⚙️ Registrar negocio</Link>
            </nav>
          </div>
          <div>
            {currentUser && <div className="mb-2 rounded-md bg-white/10 px-3 py-2 text-sm font-bold">👤 {currentUser.email}</div>}
            <button onClick={handleLogout} className="mb-3 w-full rounded-md bg-slate-700 px-3 py-2 font-bold text-white hover:bg-slate-600">🚪 Cerrar sesión</button>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300">Estado de datos</label>
              <div className="mt-2 rounded-md bg-success-900/20 px-3 py-2 text-center text-sm font-bold text-success-300">{dataStatus}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={taskRefreshOrders} className="flex-1 rounded-md bg-white py-2 font-bold text-slate-900">🔄 Actualizar</button>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <div className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-slate-900">
                  {activePanelTab === "fruver"
                    ? "Panel Fruver"
                    : activePanelTab === "lavanderia"
                    ? "Panel Lavandería"
                    : "Pedidos del día"}
                </h1>
                <div className="text-sm text-slate-500">
                  <span className="font-extrabold">{config.vertical_emoji}{config.vertical_emoji ? " " : ""}{config.business_name}</span>
                </div>
                {(isFruver || isLavanderia) && (
                  <div role="tablist" aria-label="Secciones del panel" className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      role="tab"
                      aria-selected={activePanelTab === "orders"}
                      onClick={() => setPanelTab("orders")}
                      className={`rounded px-3 py-1.5 text-sm font-bold ${activePanelTab === "orders" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                    >
                      📋 Pedidos
                    </button>
                    {isFruver && (
                      <button
                        role="tab"
                        aria-selected={activePanelTab === "fruver"}
                        onClick={() => setPanelTab("fruver")}
                        className={`rounded px-3 py-1.5 text-sm font-bold ${activePanelTab === "fruver" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                      >
                        🥬 Fruver
                      </button>
                    )}
                    {isLavanderia && (
                      <button
                        role="tab"
                        aria-selected={activePanelTab === "lavanderia"}
                        onClick={() => setPanelTab("lavanderia")}
                        className={`rounded px-3 py-1.5 text-sm font-bold ${activePanelTab === "lavanderia" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                      >
                        🧺 Lavandería
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button className="shadow-md shadow-brand-600/20" variant="primary" onClick={() => { setReceipt(null); setFormOpen(true); }}>＋ Nuevo tiquete</Button>
                <Button className="border-slate-300" variant="secondary" onClick={() => setScannerOpen(true)}>📸 Escanear QR</Button>
                <div className="hidden md:inline-flex">
                  <Button className="bg-slate-800 text-white hover:bg-slate-700" variant="primary" onClick={cashReport}>📊 Cierre de Caja</Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-[1400px] px-4 py-6">
            {activePanelTab === "fruver" ? (
              <FruverPanel
                businessId={config.business_id}
                slug={slug}
                businessName={config.business_name}
                toastFn={toast}
              />
            ) : activePanelTab === "lavanderia" ? (
              <LavanderiaPanel
                businessId={config.business_id}
                slug={slug}
                businessName={config.business_name}
                toastFn={toast}
              />
            ) : (
            <>
            {/* Onboarding (Req 12): checklist de configuración + primeros pasos */}
            {!onboardingDismissed && (
              <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SetupChecklist
                  slug={slug}
                  items={[
                    { id: "logo", label: "Sube el logo de tu negocio", hint: "Aparece en el tiquete y refuerza tu marca.", autoDone: Boolean(config.business_color) },
                    { id: "payment", label: "Configura tus métodos de pago", hint: "Nequi, Daviplata o Bancolombia para recibir saldos.", autoDone: Object.keys(config.payment_config || {}).length > 0 },
                    { id: "demo_ticket", label: "Crea un tiquete de prueba", hint: "Verás cómo lo recibe tu cliente antes de operar en real.", autoDone: orders.length > 0 },
                    { id: "whatsapp", label: "Revisa los mensajes de WhatsApp", hint: "Personaliza el texto que se envía en cada estado." },
                    { id: "login", label: "Prueba el inicio de sesión", hint: "Confirma que tu equipo puede entrar al panel.", autoDone: Boolean(currentUser) }
                  ]}
                  onDismiss={dismissOnboarding}
                />
                <FirstRunTasks
                  slug={slug}
                  onDismiss={dismissOnboarding}
                  tasks={[
                    {
                      id: "create_ticket",
                      label: "Crea tu primer tiquete",
                      hint: "Registra un pedido y genera el recibo digital.",
                      done: orders.length > 0,
                      onAction: () => { setReceipt(null); setFormOpen(true); },
                      actionLabel: "Crear"
                    },
                    {
                      id: "change_status",
                      label: "Cambia el estado de una orden",
                      hint: "Marca un pedido como en proceso, listo o entregado."
                    },
                    {
                      id: "share_link",
                      label: "Comparte el enlace por WhatsApp o QR",
                      hint: "El cliente sigue su pedido en tiempo real.",
                      onAction: () => setScannerOpen(true),
                      actionLabel: "Escanear QR"
                    }
                  ] as FirstRunTask[]}
                />
              </section>
            )}

            {/* Stats */}
            <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Pedidos</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{orders.length}</strong>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Ventas</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{money.format(orders.reduce((s, o) => s + Number(o.total || 0), 0))}</strong>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Saldos</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{money.format(orders.reduce((s, o) => s + Number(o.balance || 0), 0))}</strong>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <span className="block text-xs font-bold text-slate-500">Listos</span>
                <strong className="block text-2xl font-extrabold text-slate-900">{orders.filter((o) => o.status === findReadyStatus(config)).length}</strong>
              </div>
            </section>

            {/* Orders panel */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-card lg:col-span-1">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <strong className="text-lg font-extrabold text-slate-900">Órdenes recientes</strong>
                  <div className="text-sm text-slate-500">Últimas entradas y filtros rápidos</div>
                </div>
                <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:items-center">
                  <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                    placeholder="🔍 Buscar cliente o tiquete" className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 md:w-56 md:flex-1" />
                  <div className="flex w-full gap-2 md:w-auto">
                    <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
                      className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 md:w-auto">
                      <option value="">Todos</option>
                      {(config.status_flow_config || []).map((s: any) => (
                        <option key={s.status_key} value={s.status_key}>{s.display_label}</option>
                      ))}
                      <option value="CANCELLED">Cancelado</option>
                    </select>
                    <div className="inline-flex flex-none rounded-md border border-slate-200 bg-slate-50 p-0.5">
                      <button onClick={() => setView("table")} className={`rounded px-2 py-1 text-sm font-bold ${view === "table" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>📋 Lista</button>
                      <button onClick={() => setView("kanban")} className={`rounded px-2 py-1 text-sm font-bold ${view === "kanban" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>🗂️ Tablero</button>
                    </div>
                  </div>
                </div>
              </div>

              {orders.length === 0 ? (
                /* Estado vacío útil: el negocio aún no tiene ningún pedido (Req 12.3). */
                <EmptyState
                  emoji="🎫"
                  title="Todavía no tienes pedidos"
                  hint="Crea tu primer tiquete digital y compártelo con tu cliente por WhatsApp o QR."
                  actionLabel="＋ Crear primer tiquete"
                  onAction={() => { setReceipt(null); setFormOpen(true); }}
                />
              ) : view === "table" ? (
                <>
                  <div className="hidden lg:block">
                    <OrdersTable
                      orders={pageOrders}
                      loyalty={loyalty}
                      config={config}
                      slug={slug}
                      onOpenQr={setQrOrder}
                      onChangeStatus={handleChangeStatus}
                      onOpenDeliveryLink={openDeliveryLinkFor}
                      onRequestApproval={requestApproval}
                      onOpenScanner={() => setScannerOpen(true)}
                    />
                  </div>
                  <OrderCards
                    orders={pageOrders}
                    loyalty={loyalty}
                    config={config}
                    slug={slug}
                    onOpenQr={setQrOrder}
                    onChangeStatus={handleChangeStatus}
                  />
                </>
              ) : (
                <KanbanBoard
                  orders={filtered}
                  config={config}
                  onChangeStatus={handleChangeStatus}
                  onOpenQr={setQrOrder}
                  onOpenDeliveryLink={openDeliveryLinkFor}
                  onRequestApproval={requestApproval}
                  toastFn={toast}
                />
              )}

              {/* Pagination (oculta cuando no hay ningún pedido) */}
              {orders.length > 0 && (
              <div className="mt-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <span className="text-sm font-bold text-slate-500">
                  Mostrando {(clampedPage - 1) * pageSize + (filtered.length ? 1 : 0)}–{Math.min(clampedPage * pageSize, filtered.length)} de {filtered.length} pedidos
                </span>
                <div className="flex items-center gap-2">
                  <select value={pageSize} onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPageSizeState(v);
                    localStorage.setItem("tiquete_page_size", String(v));
                    resetPage();
                  }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm">
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1} className="rounded-md border border-slate-200 px-3 py-1 text-sm font-bold disabled:opacity-40">‹ Anterior</button>
                  <span className="text-sm font-bold text-slate-600">Página {clampedPage} de {totalPages}</span>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={clampedPage >= totalPages} className="rounded-md border border-slate-200 px-3 py-1 text-sm font-bold disabled:opacity-40">Siguiente ›</button>
                </div>
              </div>
              )}
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Coupon panel */}
              <CouponPanel orders={orders} toastFn={toast} onRedeemed={taskRefreshOrders} />
              {/* Help card */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <strong className="mb-2 block font-extrabold text-slate-900">🆘 ¿Cómo funciona?</strong>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  <li>Usa <strong>＋ Nuevo tiquete</strong> para registrar un pedido y enviarlo por WhatsApp.</li>
                  <li>Con <strong>📸 Escanear QR</strong> identifica una orden desde el QR del mostrador.</li>
                  <li>Cambia el estado desde la tabla o arrastra en el tablero.</li>
                  <li>Envía una <strong>🧾 Cotización</strong> cuando haya valores adicionales.</li>
                </ul>
              </div>
            </div>
            </>
            )}
          </div>

          {/* Mobile bottom nav */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden">
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="py-2 text-center"><span className="block text-lg">📋</span><small className="font-bold text-slate-500">Pedidos</small></button>
            <button onClick={() => setScannerOpen(true)} className="py-2 text-center"><span className="block text-lg">📸</span><small className="font-bold text-slate-500">Escanear</small></button>
            <button onClick={taskRefreshOrders} className="py-2 text-center"><span className="block text-lg">🔄</span><small className="font-bold text-slate-500">Actualizar</small></button>
            <button onClick={cashReport} className="py-2 text-center"><span className="block text-lg">📊</span><small className="font-bold text-slate-500">Caja</small></button>
          </nav>
          <div className="h-16 lg:hidden" />
        </div>
      </div>

      {/* Form drawer */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/40 lg:items-stretch" onClick={() => { setFormOpen(false); setReceipt(null); }}>
          <div className="h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl lg:h-auto lg:max-h-full lg:w-[460px] lg:p-6 lg:rounded-none"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <strong className="font-display text-lg font-extrabold text-slate-900">✅ Nuevo Tiquete Digital</strong>
              <button type="button" aria-label="Cerrar" onClick={() => { setFormOpen(false); setReceipt(null); }} className="rounded p-1 text-slate-500 hover:bg-slate-100"><span aria-hidden="true">✕</span></button>
            </div>
            <OrderForm config={config} slug={slug} toastFn={toast} onCreated={onOrderCreated} />
            {receipt && <Receipt order={receipt.order} waLink={receipt.waLink} liveUrl={receipt.liveUrl} message={receipt.message} />}
          </div>
        </div>
      )}

      {/* Modals */}
      {qrOrder && <QrModal order={qrOrder} config={config} slug={slug} onClose={() => setQrOrder(null)} />}
      {deliveryPhotoFor && (
        <DeliveryPhotoModal
          onSkip={() => {
            const info = deliveryPhotoFor;
            setDeliveryPhotoFor(null);
            if (info) doChangeOrderStatus(info.order.id, info.newStatus, null);
          }}
          onConfirm={(photo) => {
            const info = deliveryPhotoFor;
            setDeliveryPhotoFor(null);
            if (info) doChangeOrderStatus(info.order.id, info.newStatus, photo);
          }}
        />
      )}
      {deliveryLinkOrder && (
        <DeliveryLinkModal order={deliveryLinkOrder} businessId={config.business_id} toastFn={toast} onClose={() => setDeliveryLinkOrder(null)} />
      )}
      <QuoteModal
        open={!!quoteOrder}
        onClose={() => setQuoteOrder(null)}
        onConfirm={submitQuote}
        defaultAmount={quoteOrder?.total || ""}
        defaultDescription={quoteOrder?.items_text || ""}
        orderNumber={quoteOrder?.order_number}
        customerName={quoteOrder?.customer_name}
      />
      {scannerOpen && <ScannerModal onDetect={handleScanned} onClose={() => setScannerOpen(false)} />}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl lg:bottom-8">
          {toastMsg}
        </div>
      )}
    </main>
  );
}

// Small hook to load the business list for the selector
function useBusinessList(slug: string, config: BusinessConfig, hasSlugParam: boolean) {
  const [businesses, setBusinesses] = useState<any[]>([]);
  useEffect(() => {
    if (hasSlugParam) {
      setBusinesses([{ slug, name: config.business_name, vertical_emoji: config.vertical_emoji }]);
      return;
    }
    apiGetJSON("/api/list-businesses")
      .then((res) => {
        if (res.ok) setBusinesses(res.data?.businesses || []);
      })
      .catch(() => {});
  }, [slug, hasSlugParam, config.business_name, config.vertical_emoji]);
  return businesses;
}

function PanelFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

export default function PanelPage() {
  return (
    <Suspense fallback={<PanelFallback />}>
      <PanelInner />
    </Suspense>
  );
}