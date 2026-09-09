import type { Metadata } from "next";
import Link from "next/link";
import { handler as publicCatalogHandler } from "@/app/api/public-catalog/impl";
import {
  DEFAULT_BRAND_COLOR,
  normalizeHex,
  readableTextColor
} from "@/lib/fruver/brand";
import type { PublicProduct } from "@/lib/fruver/types";
import type { PublicPromotionAny } from "@/lib/fruver/sanitize";
import type { AdvertisingBlocks } from "@/lib/fruver/advertising";
import AdvertisingSection from "../AdvertisingSection";
import ComoFuncionaSection from "./ComoFuncionaSection";
import FuncionalidadesSection from "./FuncionalidadesSection";

// Render dynamically (SSR) without caching the Catálogo_Handler response, since
// the advertising reflects live promotions and the daily catalog (R1.2).
export const dynamic = "force-dynamic";

interface PublicBusiness {
  slug: string;
  name: string;
  color: string | null;
  logo_url: string | null;
}

interface CatalogData {
  business: PublicBusiness;
  products: PublicProduct[];
  promotions: PublicPromotionAny[];
  advertising: AdvertisingBlocks;
}

/**
 * Loads the public business data + sanitized advertising blocks by invoking the
 * existing `Catálogo_Handler` (`public-catalog`) on the server — the same reuse
 * pattern as the catalog page (`../page.tsx`). No new endpoint is introduced.
 *
 * The business is resolved exclusively from the received `slug`, so only data
 * for the matching `business_id` is ever returned (R1.1, R1.4), and only the
 * sanitized public projection reaches the page (R1.3).
 *
 * Returns `null` when the handler responds with a status other than 200 or when
 * the body is not interpretable (invalid JSON), which drives the
 * "Negocio no disponible" state (R1.5).
 */
async function loadCatalog(slug: string): Promise<CatalogData | null> {
  const res = await publicCatalogHandler({
    httpMethod: "GET",
    body: null,
    headers: {},
    queryStringParameters: { slug }
  });
  if (res.statusCode !== 200) return null;
  try {
    return JSON.parse(res.body) as CatalogData;
  } catch {
    return null;
  }
}

/**
 * Shareable metadata (title/description + Open Graph) built from the public
 * business data (Datos_Públicos), with an owner-focused framing that positions
 * the platform as a management tool for the business owner (R11.1, R11.2).
 *
 * When no public data is available, backup metadata is produced indicating that
 * the business is not available (R11.3).
 */
export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadCatalog(slug);

  // No public data available → backup metadata (R11.3).
  if (!data) {
    return {
      title: "Negocio no disponible",
      description: "No encontramos este negocio o su información no está publicada."
    };
  }

  // Owner-focused title/description derived from the public business data
  // (R11.1): the platform is presented as a management tool for the owner.
  const title = `${data.business.name} · Gestiona tu negocio con catálogo y cotizaciones en línea`;
  const description = `Descubre cómo ${data.business.name} publica su catálogo, gestiona promociones y cotizaciones, y convierte cada cotización en un pedido con tiquete. La plataforma de gestión para el dueño del negocio.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      // Include the business logo in Open Graph images when available (R11.2).
      ...(data.business.logo_url ? { images: [{ url: data.business.logo_url }] } : {})
    }
  };
}

export default async function FruverAdvertisingPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadCatalog(slug);

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Negocio no disponible</h1>
          <p className="mt-2 text-slate-500">
            No encontramos este negocio o su información no está publicada.
          </p>
        </div>
      </main>
    );
  }

  const { business, promotions, advertising } = data;

  // Apply the brand color to primary surfaces while keeping accessible (AA)
  // text contrast, reusing the shared pure helpers (R1.3, R1.4).
  const brandColor = normalizeHex(business.color) ?? DEFAULT_BRAND_COLOR;
  const brandTextColor = readableTextColor(brandColor);

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      {/* ── Hero: logo, name, brand + owner-focused pitch (R3.1, R3.2) ── */}
      <header
        className="relative overflow-hidden px-6 py-12"
        style={{ backgroundColor: brandColor, color: brandTextColor }}
      >
        <span
          className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-10"
          style={{ backgroundColor: brandTextColor }}
        />
        <span
          className="pointer-events-none absolute -bottom-8 left-1/4 h-28 w-28 rounded-full opacity-10"
          style={{ backgroundColor: brandTextColor }}
        />

        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              className="h-24 w-24 shrink-0 rounded-3xl border border-white/50 bg-white object-contain p-2 shadow-lg sm:h-28 sm:w-28"
            />
          ) : (
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border-2 border-white/30 bg-white/20 text-4xl shadow-lg">
              🛒
            </div>
          )}
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">{business.name}</h1>
            {/* Owner-focused pitch: positions the platform as a management tool
                for the business owner (R3.1, R3.2). */}
            <p className="mx-auto mt-2 max-w-md text-sm font-medium opacity-90">
              Tu plataforma de gestión para {business.name}: publica tu catálogo,
              administra promociones y cotizaciones, y convierte cada cotización en
              un pedido con tiquete. Todo desde un solo lugar.
            </p>
          </div>

          {/* Primary CTA toward the catalog (R3.3), with explicit action text
              and a ≥ 48px touch target (R9.3, R10.4). */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/fruver/${business.slug}`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-7 py-3 text-sm font-extrabold shadow-lg transition hover:opacity-90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
              style={{ color: brandColor }}
            >
              <span aria-hidden="true">🛒</span>
              Ver catálogo y cotizar
            </Link>
            {/* Acceso al Centro de gestión para que el dueño encuentre todas las
                funcionalidades desde un solo lugar. */}
            <Link
              href={`/fruver/${business.slug}/inicio`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl border border-white/60 px-6 py-3 text-sm font-extrabold shadow-sm transition hover:bg-white/10 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
              style={{ color: brandTextColor }}
            >
              <span aria-hidden="true">🧭</span>
              Centro de gestión
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {/* ── Sección_Cómo_Funciona — bloque explicativo estático que describe
            el flujo de extremo a extremo, tras el hero (R4.1, R4.2, R4.3). ── */}
        <ComoFuncionaSection />

        {/* ── Sección_Funcionalidades — bloque explicativo estático que detalla
            las funcionalidades de gestión y el puente cotización→pedido→tiquete,
            tras la Sección_Cómo_Funciona (R5, R6, R7, R10). ── */}
        <FuncionalidadesSection />

        {/* ── Sección_Publicidad — reutiliza el renderer compartido, que solo
            muestra bloques con contenido y omite la sección cuando no hay
            publicidad ni promociones vigentes (R8.1, R8.2, R8.3). La invitación
            a redes se renderiza dentro cuando existe (R9.1). ── */}
        <AdvertisingSection advertising={advertising} promotions={promotions} brandColor={brandColor} />

        {/* ── CTA_Cotizar de cierre hacia /fruver/[slug] con texto de acción
            explícito que describe su destino (R9.2, R9.3). Aplica brandColor de
            fondo y brandTextColor al texto, con foco visible y altura táctil
            ≥ 48 px (R2.2, R2.3, R10.1, R10.4). ── */}
        <section className="mt-8 rounded-3xl border border-slate-100 bg-white px-6 py-8 text-center shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-800">¿Listo para tu pedido?</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Explora el catálogo del día y arma tu cotización. El total lo confirma el
            negocio según disponibilidad y peso real.
          </p>
          <Link
            href={`/fruver/${business.slug}`}
            className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-7 py-3 text-sm font-extrabold shadow-lg transition hover:opacity-90 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400"
            style={{ backgroundColor: brandColor, color: brandTextColor }}
          >
            <span aria-hidden="true">📲</span>
            Ir al catálogo y cotizar
          </Link>
        </section>
      </div>
    </main>
  );
}
