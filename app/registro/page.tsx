"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const VERTICALS = [
  { id: "l", label: "Lavandería" },
  { id: "sw", label: "Lavado en seco" }
];

const COLORS = ["#0B6E4F", "#1f2937", "#2563eb", "#7c3aed", "#c2410c"];

const unitsOptions = ["per_kg", "per_item", "per_hour", "flat_rate"];

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [vertical, setVertical] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [locationRadiusKm, setLocationRadiusKm] = useState(0);
  const [currency, setCurrency] = useState("COP");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [settings, setSettings] = useState({
    intake_photo: false,
    delivery_photo: false,
    whatsapp_message: true,
    auto_ticket_number: true,
    show_items_when_ready: true,
    orders_list_public: true,
    global_message: ""
  });
  const [payment, setPayment] = useState({ nequi: "", daviplata: "", bancolombia: "", account_holder: "" });
  const [steps, setSteps] = useState([
    { name: "Recibimos tu pedido", desc: "Cuando el cliente entrega sus prendas.", enabled: true },
    { name: "Está en proceso", desc: "El lavado o servicio está en marcha.", enabled: true },
    { name: "Está listo para recoger", desc: "El pedido está listo y puede pasar.", enabled: true },
    { name: "Ya fue entregado", desc: "Confirmamos la entrega.", enabled: true }
  ]);
  const [units, setUnits] = useState([
    { label: "Por kilo", value: "per_kg", price: 6000, enabled: true },
    { label: "Por prenda", value: "per_item", price: 4000, enabled: false },
    { label: "Por hora", value: "per_hour", price: 0, enabled: false },
    { label: "Tarifa fija", value: "flat_rate", price: 0, enabled: false }
  ]);

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);

  const inputCls =
    "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  const generateSlug = useCallback((name: string) => {
    const base = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return base.slice(0, 40);
  }, []);

  async function checkSlug(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setSlugAvailable(null);
      return;
    }
    try {
      const res = await fetch(`/api/check-slug?slug=${encodeURIComponent(trimmed)}`);
      const dataRes = await res.json().catch(() => undefined);
      // Handle undefined/unexpected responses safely: only treat as available
      // when the endpoint explicitly returns available === true.
      if (dataRes && typeof dataRes.available === "boolean") {
        setSlugAvailable(dataRes.available);
      } else {
        setSlugAvailable(false);
      }
    } catch {
      setSlugAvailable(false);
    }
  }

  useEffect(() => {
    if (slug) checkSlug(slug);
  }, [slug]);

  function handleLogo(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function buildPayload(): any {
    const name = businessName.trim();
    const finalSlug = slug.trim() || generateSlug(name);
    return {
      action: "register",
      name,
      slug: finalSlug,
      vertical,
      phone: businessPhone,
      location_radius_km: Number(locationRadiusKm) || 0,
      currency,
      logo_url: logoDataUrl,
      settings,
      payment_config: {
        nequi: payment.nequi.trim(),
        daviplata: payment.daviplata.trim(),
        bancolombia: payment.bancolombia.trim(),
        account_holder: payment.account_holder.trim()
      },
      message_steps: steps,
      pricing: [
        { unit: "per_kg", label: "Por kilo", price: Number(units[0].price) || 0 },
        { unit: "per_item", label: "Por prenda", price: Number(units[1].price) || 0 },
        { unit: "per_hour", label: "Por hora", price: Number(units[2].price) || 0 },
        { unit: "flat_rate", label: "Tarifa fija", price: Number(units[3].price) || 0 }
      ]
    };
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/save-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload())
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.detail || data.message || "No se pudo registrar el negocio. Intenta de nuevo.");
        setSubmitting(false);
        return;
      }
      const registeredSlug = data.business?.slug || buildPayload().slug;
      // `new=1` activa el onboarding (SetupChecklist + FirstRunTasks) en el panel.
      router.push(`/panel?slug=${encodeURIComponent(registeredSlug)}&new=1`);
    } catch (err) {
      setError("Error de conexión. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  function canContinue(): boolean {
    if (step === 1) {
      return Boolean(businessName.trim() && slug.trim() && slugAvailable && businessPhone.trim() && vertical);
    }
    if (step === 4) {
      return Boolean(units[0].price > 0 && steps.filter((s) => s.enabled).length >= 3);
    }
    return true;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4">
        <span className="font-display text-xl font-extrabold text-slate-900">🗿 TiqueteVivo</span>
        <button onClick={() => router.push("/")} className="text-sm font-bold text-slate-600 hover:text-slate-900">
          ← Inicio
        </button>
      </header>

      <div className="mx-auto max-w-[720px] px-4 py-6">
        <h1 className="font-display text-3xl text-slate-900 md:text-4xl">Registra tu negocio</h1>
        <p className="mt-2 text-slate-600">Dashboard limpio, mensajes por WhatsApp y recibos digitales.</p>

        <div className="mt-6 flex gap-2">
          {["Datos", "Canales", "Tarifas", "Mensajes", "Confirmación"].map((label, i) => (
            <button
              key={label}
              onClick={() => i + 1 < step && setStep(i + 1)}
              className={`flex-1 rounded-full py-2 text-xs font-extrabold transition-colors ${
                step >= i + 1 ? "bg-brand-600 text-white" : "bg-white text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleRegister} className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          {step === 1 && (
            <div className="space-y-4">
              <label className="block">
                Tipo de negocio
                <select className={inputCls} value={vertical} onChange={(e) => setVertical(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {VERTICALS.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                Nombre del negocio
                <input className={inputCls} value={businessName} placeholder="Ej: Majesty Lavandería"
                  onChange={(e) => setBusinessName(e.target.value)} required />
              </label>
              <label className="block">
                Slug (identificador único)
                <input className={inputCls} value={slug} placeholder={generateSlug(businessName) || "tu-negocio"}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())} required />
                {slugAvailable === false && (
                  <span className="mt-1 block text-xs font-bold text-error-700">Ya existe un negocio con ese slug.</span>
                )}
                {slug.trim() !== "" && slugAvailable === true && (
                  <span className="mt-1 block text-xs font-bold text-success-700">Slug disponible ✔</span>
                )}
              </label>
              <label className="block">
                WhatsApp del negocio
                <input className={inputCls} value={businessPhone} placeholder="+573001234567"
                  onChange={(e) => setBusinessPhone(e.target.value.replace(/[^\d+]/g, ""))} required />
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <input type="number" min={0} className="w-20 rounded-md border border-slate-200 px-2 py-1" value={locationRadiusKm}
                  onChange={(e) => setLocationRadiusKm(Number(e.target.value))} />
                Radio de recogida/entrega (km)
              </label>
              <label className="block">
                Logo (opcional)
                <input type="file" accept="image/*" onChange={(e) => handleLogo(e.target.files?.[0])} className="mt-2" />
                {logoDataUrl && (
                  <img src={logoDataUrl} alt="Logo" className="mt-3 h-16 w-16 rounded-lg border border-slate-200 object-contain" />
                )}
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <strong className="block text-sm">Configuración</strong>
                {[
                  ["intake_photo", "Foto de entrada para cada pedido"],
                  ["delivery_photo", "Foto obligatoria al marcar entrega"],
                  ["whatsapp_message", "Enviar WhatsApp al registrar pedido"],
                  ["auto_ticket_number", "Numeración automática de tiquete"],
                  ["show_items_when_ready", "Mostrar ítems al marcar listo"],
                  ["orders_list_public", "Consulta de pedidos sin login"]
                ].map(([key, label]) => (
                  <label key={key} className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-600">
                    <input type="checkbox" checked={(settings as any)[key] as boolean}
                      onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} className="accent-brand-600 h-4 w-4" />
                    {label}
                  </label>
                ))}
              </div>
              <div>
                <strong className="block text-sm">Métodos de pago</strong>
                <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block">Nequi
                    <input className={inputCls} value={payment.nequi} onChange={(e) => setPayment({ ...payment, nequi: e.target.value })} placeholder="310 268 8991" />
                  </label>
                  <label className="block">Daviplata
                    <input className={inputCls} value={payment.daviplata} onChange={(e) => setPayment({ ...payment, daviplata: e.target.value })} placeholder="310 268 8991" />
                  </label>
                  <label className="block">Bancolombia
                    <input className={inputCls} value={payment.bancolombia} onChange={(e) => setPayment({ ...payment, bancolombia: e.target.value })} placeholder="000-111222-33" />
                  </label>
                  <label className="block">Titular
                    <input className={inputCls} value={payment.account_holder} onChange={(e) => setPayment({ ...payment, account_holder: e.target.value })} placeholder="Nombre del titular" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {units.map((u, i) => (
                <div key={u.value} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={u.enabled} className="accent-brand-600 h-4 w-4"
                      onChange={() => {
                        const next = [...units];
                        next[i] = { ...next[i], enabled: !next[i].enabled };
                        setUnits(next);
                      }} />
                    <strong className="flex-1">{u.label}</strong>
                    <span className="text-xs font-bold text-slate-400">{unitsOptions[i]}</span>
                  </div>
                  {u.enabled && (
                    <label className="mt-2 block text-sm">
                      Precio base (COP)
                      <input type="number" min={0} className={inputCls} value={u.price}
                        onChange={(e) => {
                          const next = [...units];
                          next[i] = { ...next[i], price: Number(e.target.value) };
                          setUnits(next);
                        }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {steps.map((s, i) => (
                <div key={s.name} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={s.enabled} className="accent-brand-600 h-4 w-4" disabled={i === 0 || i === 3}
                      onChange={() => {
                        const next = [...steps];
                        next[i] = { ...next[i], enabled: !next[i].enabled };
                        setSteps(next);
                      }} />
                    <strong className="flex-1">{i + 1}. {s.name}</strong>
                  </div>
                  <input className={inputCls} value={s.desc} placeholder="Descripción de este mensaje"
                    onChange={(e) => {
                      const next = [...steps];
                      next[i] = { ...next[i], desc: e.target.value };
                      setSteps(next);
                    }} />
                </div>
              ))}
              <label className="mt-4 block">
                Mensaje global (al final del tiquete, opcional)
                <textarea rows={2} className={inputCls} value={settings.global_message}
                  onChange={(e) => setSettings({ ...settings, global_message: e.target.value })} />
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="rounded-lg bg-white p-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  {logoDataUrl ? (
                    <img src={logoDataUrl} className="h-8 w-8 rounded-lg object-contain" alt="logo" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
                      {(businessName || "B").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <strong>{businessName || "Tu negocio"}</strong>
                  <span className="ml-auto flex gap-1">
                    {COLORS.slice(0, 3).map((c) => <span key={c} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />)}
                  </span>
                </div>
                <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm">
                  <div className="flex justify-between"><span>Prendas</span><strong>2 tenis Vans, 1 Converse blanco.</strong></div>
                  <div className="mt-1 flex justify-between"><span>Total</span><strong>$45.000</strong></div>
                  <div className="flex justify-between"><span>Abono</span><strong>$20.000</strong></div>
                  <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span>Saldo</span><strong className="text-brand-700">$25.000</strong></div>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Revisa la vista previa. Podrás ajustar todo después desde el panel de tu negocio.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}
              className="rounded-lg border border-slate-200 px-4 py-2 font-bold text-slate-600 disabled:opacity-40">
              Atrás
            </button>
            {step < 5 ? (
              <button type="button" disabled={!canContinue()} onClick={() => setStep(step + 1)}
                className="rounded-lg bg-slate-900 px-5 py-2 font-bold text-white disabled:opacity-40">
                Continuar
              </button>
            ) : (
              <button type="submit" disabled={submitting}
                className="rounded-lg bg-brand-600 px-5 py-2 font-extrabold text-white hover:bg-brand-700 disabled:opacity-60">
                {submitting ? "Registrando…" : "Registrar negocio"}
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-error-50 px-3 py-2 text-sm font-bold text-error-700">{error}</p>
          )}
        </form>
      </div>
    </main>
  );
}