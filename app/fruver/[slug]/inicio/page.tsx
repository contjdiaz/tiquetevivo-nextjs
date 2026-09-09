import type { Metadata } from "next";
import Link from "next/link";
import { handler as publicCatalogHandler } from "@/app/api/public-catalog/impl";
import FruverActionCard from "@/components/fruver/FruverActionCard";
import FruverBrandHeader from "@/components/fruver/FruverBrandHeader";
import FruverPageShell from "@/components/fruver/FruverPageShell";

export const dynamic = "force-dynamic";

interface PublicBusiness {
  slug: string;
  name: string;
  color: string | null;
  logo_url: string | null;
}

interface CatalogData {
  business: PublicBusiness;
}

async function loadBusiness(slug: string): Promise<PublicBusiness | null> {
  const res = await publicCatalogHandler({
    httpMethod: "GET",
    body: null,
    headers: {},
    queryStringParameters: { slug }
  });
  if (res.statusCode !== 200) return null;
  try {
    const data = JSON.parse(res.body) as CatalogData;
    return data.business ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const business = await loadBusiness(slug);
  if (!business) return { title: "Negocio no disponible" };
  return {
    title: `${business.name} · Centro de Fruver`,
    description: `Accesos para comprar, consultar pedidos y gestionar ${business.name}.`
  };
}

function NotAvailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-200 text-2xl">🛒</div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-800">Negocio no disponible</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">No encontramos este negocio o su información no está publicada.</p>
      </div>
    </main>
  );
}

export default async function FruverInicioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await loadBusiness(slug);
  if (!business) return <NotAvailable />;

  return (
    <FruverPageShell color={business.color} className="pb-14">
      <FruverBrandHeader name={business.name} logoUrl={business.logo_url} color={business.color} />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <section aria-labelledby="task-heading">
          <div className="max-w-2xl">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--fruver-primary)]">Centro de Fruver</p>
            <h2 id="task-heading" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">¿Qué quieres hacer?</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">Elige una tarea para continuar con {business.name}.</p>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            <FruverActionCard
              href={`/fruver/${business.slug}`}
              title="Ver catálogo y cotizar"
              description="Explora los productos del día, arma tu pedido y consulta el total estimado."
              icon="🛒"
              primary
            />
            <FruverActionCard
              href={`/panel?slug=${business.slug}`}
              title="Gestionar mi negocio"
              description="Administra pedidos, catálogo, promociones, cotizaciones y analítica."
              icon="📋"
            />
          </div>
        </section>

        <section className="mt-10" aria-labelledby="quick-actions-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="quick-actions-heading" className="text-lg font-extrabold text-slate-900">Acciones rápidas</h2>
              <p className="mt-1 text-sm text-slate-500">Accesos útiles para seguir tu pedido o compartir el negocio.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FruverActionCard href={`/buscar?slug=${business.slug}`} title="Buscar mi pedido" description="Consulta el estado con tu número o teléfono." icon="🔎" />
            <FruverActionCard href={`/tiquete?slug=${business.slug}`} title="Ver mi tiquete digital" description="Abre tu recibo digital y el código QR." icon="🎟️" />
            <FruverActionCard href={`/panel?slug=${business.slug}`} title="Gestionar una entrega" description="Genera el enlace temporal para el domiciliario." icon="🛵" />
            <FruverActionCard href={`/fruver/${business.slug}/publicidad`} title="Conocer el negocio" description="Consulta la presentación y funcionalidades de la plataforma." icon="📣" />
          </div>
        </section>

        <details className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer list-none text-sm font-extrabold text-slate-800">¿Cómo funciona el flujo?</summary>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
            <li><strong className="text-slate-900">1.</strong> El operador publica el catálogo o crea el pedido.</li>
            <li><strong className="text-slate-900">2.</strong> El cliente cotiza, recibe su tiquete y consulta el estado.</li>
            <li><strong className="text-slate-900">3.</strong> El domiciliario confirma la entrega desde un enlace temporal.</li>
          </ol>
        </details>

        <div className="mt-8 text-center">
          <Link href={`/fruver/${business.slug}`} className="text-sm font-extrabold text-[var(--fruver-primary)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fruver-focus)] focus-visible:ring-offset-2">
            Ir directamente al catálogo →
          </Link>
        </div>
      </div>
    </FruverPageShell>
  );
}
