"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Field, { inputCls } from "@/components/ui/Field";

export default function HomePage() {
  const [formData, setFormData] = useState({ business: "", name: "", phone: "", city: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      await fetch("/api/save-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
    } catch (err) {
      console.warn("No se pudo enviar el lead:", err);
    }
    setStatus("done");
  }

  return (
    <main>
      <header className="bg-white py-12">
        <div className="mx-auto grid max-w-[1160px] grid-cols-1 items-center gap-14 px-4 md:grid-cols-[1fr_430px]">
          <div>
            <span className="inline-flex rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-sm font-extrabold text-brand-800">
              Recibos digitales para negocios de servicio
            </span>
            <h1 className="font-display mt-4 max-w-[820px] text-4xl leading-tight text-slate-900 sm:text-5xl md:text-6xl">
              Tu negocio sin tiquetes perdidos ni saldos olvidados.
            </h1>
            <p className="mt-3 max-w-[710px] text-lg text-slate-700">
              Lavanderías, parqueaderos, talleres, pastelerías y más. Entrega recibos profesionales por WhatsApp y
              controla cada pedido en segundos.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/registro"
                className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-3 font-extrabold text-white shadow-[0_4px_14px_rgba(23,125,91,0.3)] transition-colors hover:bg-brand-700"
              >
                Registrar mi negocio gratis
              </Link>
              <Link
                href="/panel?slug=majesty"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 font-extrabold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Ver demo
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-slate-600">
              <span className="inline-flex items-center gap-2">
                <span className="text-brand-600">✓</span>Menos llamadas repetidas
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="text-brand-600">✓</span>Cobros más claros
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="text-brand-600">✓</span>Imagen más profesional
              </span>
            </div>
          </div>
          <div aria-hidden="true">
            <div className="min-h-[520px] overflow-hidden rounded-2xl border-8 border-slate-900 shadow-2xl" style={{ backgroundColor: "var(--color-whatsapp-bg)" }}>
              <div className="flex h-12 items-center gap-2 bg-[var(--color-whatsapp-brand)] px-3 text-sm font-extrabold text-white">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20">🏪</span>
                <span className="flex-1">MAJESTY Lavandería</span>
                <span className="text-lg text-white/70">⋮</span>
              </div>
              <div className="space-y-2 p-4">
                <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white p-3 text-sm shadow-sm">
                  <strong>MAJESTY | Tiquete #8707</strong>
                  <br />
                  Hola Richard, recibimos:
                  <br />
                  2 tenis Vans, 1 Converse blanco.
                  <br />
                  <br />
                  Total $390.000
                  <br />
                  Abono $200.000
                  <br />
                  <strong>Saldo $190.000</strong>
                  <span className="block text-right text-xs text-slate-400">10:30 a.m.</span>
                </div>
                <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white p-3 text-sm shadow-sm">
                  <strong>Tu pedido ya está listo</strong>
                  <br />
                  Puedes recogerlo hoy. Recuerda pagar el saldo pendiente.
                  <span className="block text-right text-xs text-slate-400">hoy</span>
                </div>
                <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[var(--color-whatsapp-bubble)] p-3 text-sm shadow-sm">
                  Gracias, paso esta tarde.
                  <span className="block text-right text-xs text-slate-500">2:15 p.m.</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/60 bg-white/80 p-3">
                <strong className="text-2xl">24/7</strong>
                <span className="block text-sm font-extrabold text-slate-600">avisos disponibles</span>
              </div>
              <div className="rounded-lg border border-white/60 bg-white/80 p-3">
                <strong className="text-2xl">0</strong>
                <span className="block text-sm font-extrabold text-slate-600">papel requerido</span>
              </div>
              <div className="rounded-lg border border-white/60 bg-white/80 p-3">
                <strong className="text-2xl">1</strong>
                <span className="block text-sm font-extrabold text-slate-600">panel central</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="beneficios" className="py-20">
        <div className="mx-auto max-w-[1160px] px-4">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl text-slate-900 md:text-4xl">
              Convierte cada pedido en una experiencia clara.
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Tu cliente sabe qué dejó, cuánto pagó, cuánto debe y cuándo puede recoger. Tu equipo deja de buscar
              papel y empieza a atender mejor.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-card">
              <span className="inline-flex rounded-full bg-info-50 px-3 py-1 text-sm font-extrabold text-info-700">Control</span>
              <strong className="mt-4 block text-lg">Pedidos siempre a la mano</strong>
              <p className="mt-2 text-slate-600">Busca por cliente, número de tiquete o estado. Todo queda organizado desde el primer día.</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-card">
              <span className="inline-flex rounded-full bg-warning-50 px-3 py-1 text-sm font-extrabold text-warning-700">Cobro</span>
              <strong className="mt-4 block text-lg">Saldos visibles antes de entregar</strong>
              <p className="mt-2 text-slate-600">Evita que se vayan prendas sin terminar el pago. El saldo aparece en el panel y en el mensaje.</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-card">
              <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-sm font-extrabold text-violet-700">Confianza</span>
              <strong className="mt-4 block text-lg">WhatsApp con imagen profesional</strong>
              <p className="mt-2 text-slate-600">Recibos claros, mensajes consistentes y una experiencia moderna para tus clientes.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="flujo" className="border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-[1160px] px-4">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl text-slate-900 md:text-4xl">
              Del mostrador al WhatsApp en menos de un minuto.
            </h2>
            <p className="mt-3 text-lg text-slate-600">
              Un flujo simple para que cualquier persona del equipo pueda usarlo sin capacitación larga.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[
              { n: "1", t: "Recibe el pedido", d: "Registra cliente, prendas, servicio, total y abono." },
              { n: "2", t: "Envía el recibo", d: "El cliente recibe el detalle en su WhatsApp." },
              { n: "3", t: "Actualiza el estado", d: "Marca recibido, en proceso, listo o entregado." },
              { n: "4", t: "Cobra sin olvidar", d: "El saldo queda visible antes de entregar." }
            ].map((s) => (
              <article key={s.n} className="rounded-lg border border-slate-200 bg-white p-5 text-center">
                <b className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded bg-slate-900 text-white">{s.n}</b>
                <strong className="block">{s.t}</strong>
                <p className="mt-2 text-sm text-slate-600">{s.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-[1160px] grid-cols-1 items-stretch gap-6 px-4 md:grid-cols-2">
          <div className="flex flex-col justify-center rounded-lg bg-slate-900 p-6 text-white">
            <p className="text-lg md:text-xl">
              “Se ve más profesional y el cliente deja de preguntar tres veces por el mismo pedido.”
            </p>
            <small className="mt-3 block opacity-80">Ejemplo de impacto esperado para lavanderías con alto volumen de WhatsApp.</small>
          </div>
          <div className="flex flex-col justify-center rounded-lg border border-brand-100 bg-brand-50 p-6">
            <strong className="text-3xl text-brand-800">$190.000</strong>
            <p className="mt-2 font-extrabold text-brand-800">Saldo pendiente visible en el recibo y en el panel antes de entregar la orden.</p>
          </div>
        </div>
      </section>

      <section id="contacto" className="border-y border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-[1160px] px-4">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-display text-3xl text-slate-900 md:text-4xl">Agenda una demo para tu lavandería.</h2>
            <p className="mt-3 text-lg text-slate-600">
              Te mostramos el panel con un ejemplo parecido a tu negocio y resolvemos si encaja con tu operación diaria.
            </p>
          </div>
          {status === "done" ? (
            <div className="mt-4 font-extrabold text-brand-800">
              Listo. Recibimos tu solicitud y te contactaremos por WhatsApp.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Nombre del negocio" required>
                <input className={inputCls} name="business" required placeholder="Ej: Majesty Lavandería" value={formData.business}
                  onChange={(e) => setFormData({ ...formData, business: e.target.value })} />
              </Field>
              <Field label="Tu nombre" required>
                <input className={inputCls} name="name" required placeholder="Ej: Richard Diaz" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </Field>
              <Field label="WhatsApp" required>
                <input className={inputCls} name="phone" required placeholder="+57 300 123 4567" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </Field>
              <Field label="Ciudad" required>
                <input className={inputCls} name="city" required placeholder="Medellín" value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </Field>
              <Button
                type="submit"
                disabled={status === "sending"}
                className="py-3 md:col-span-2"
              >
                {status === "sending" ? "Enviando..." : "Solicitar demo personalizada"}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}