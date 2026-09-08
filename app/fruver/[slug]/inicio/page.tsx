import type { Metadata } from "next";
import Link from "next/link";
import { handler as publicCatalogHandler } from "@/app/api/public-catalog/impl";
import {
  DEFAULT_BRAND_COLOR,
  normalizeHex,
  readableTextColor
} from "@/lib/fruver/brand";

// SSR dinámico: refleja el nombre/color/logo actuales del negocio sin caché.
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

/**
 * Centro de mando del negocio fruver: página de navegación que agrupa todos los
 * accesos del vertical por perfil (Dueño/Operador, Cliente/Usuario y
 * Domiciliario). Reutiliza el `Catálogo_Handler` existente para resolver el
 * negocio por `slug` y aplicar su marca; no crea endpoints nuevos.
 */
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

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const business = await loadBusiness(slug);
  if (!business) {
    return { title: "Negocio no disponible" };
  }
  return {
    title: `${business.name} · Centro de gestión`,
    description: `Accesos rápidos a todas las funcionalidades de ${business.name}: panel del dueño, catálogo público, tiquetes y entregas.`
  };
}

/** Un enlace de acceso dentro de una tarjeta de perfil. */
interface AccesoLink {
  href: string;
  titulo: string;
  descripcion: string;
  icono: string;
  externo?: boolean;
}

/** Un perfil (grupo) con sus accesos. */
interface PerfilCard {
  id: string;
  titulo: string;
  subtitulo: string;
  icono: string;
  quien: string;
  accesos: AccesoLink[];
}

function AccesoRow({ acceso, brandColor }: { acceso: AccesoLink; brandColor: string }) {
  const inner = (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm transition hover:border-slate-200 hover:shadow-md focus-within:ring-2 focus-within:ring-offset-2">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg"
        style={{ backgroundColor: `${brandColor}1a` }}
      >
        {acceso.icono}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
          {acceso.titulo}
          {acceso.externo && <span aria-hidden="true" className="text-xs text-slate-400">↗</span>}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{acceso.descripcion}</p>
      </div>
    </div>
  );

  if (acceso.externo) {
    return (
      <a
        href={acceso.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block min-h-[48px] rounded-2xl focus:outline-none"
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={acceso.href} className="block min-h-[48px] rounded-2xl focus:outline-none">
      {inner}
    </Link>
  );
}

export default async function FruverInicioPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await loadBusiness(slug);

  if (!business) {
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

  const brandColor = normalizeHex(business.color) ?? DEFAULT_BRAND_COLOR;
  const brandTextColor = readableTextColor(brandColor);

  // Accesos organizados por los tres perfiles del sistema.
  const perfiles: PerfilCard[] = [
    {
      id: "duenio",
      titulo: "Dueño / Operador",
      subtitulo: "Gestiona el negocio e inicia el flujo de WhatsApp",
      icono: "🧑‍💼",
      quien: "Quien crea los pedidos y administra el catálogo (requiere iniciar sesión)",
      accesos: [
        {
          href: `/panel?slug=${business.slug}`,
          titulo: "Panel del negocio",
          descripcion:
            "Crea pedidos, envía el tiquete por WhatsApp, gestiona catálogo, promociones, cotizaciones y analítica.",
          icono: "📋"
        },
        {
          href: `/fruver/${business.slug}/publicidad`,
          titulo: "Landing de presentación",
          descripcion:
            "Página compartible que explica las funcionalidades de la plataforma. Ideal para difundir el negocio.",
          icono: "📣"
        }
      ]
    },
    {
      id: "usuario",
      titulo: "Cliente / Usuario",
      subtitulo: "Lo que ve y usa quien recibe el pedido",
      icono: "🛒",
      quien: "Quien cotiza, consulta su tiquete y recibe la compra (sin iniciar sesión)",
      accesos: [
        {
          href: `/fruver/${business.slug}`,
          titulo: "Catálogo y cotización",
          descripcion:
            "Explora los productos del día, arma la cotización y ve el total estimado en tiempo real.",
          icono: "🥬"
        },
        {
          href: `/buscar?slug=${business.slug}`,
          titulo: "Buscar mi pedido",
          descripcion: "El cliente consulta el estado de su pedido por número o teléfono.",
          icono: "🔎"
        },
        {
          href: `/tiquete?slug=${business.slug}`,
          titulo: "Tiquete digital",
          descripcion:
            "El recibo digital con QR que el operador envía al cliente. Se abre con el número de pedido.",
          icono: "🎟️"
        }
      ]
    },
    {
      id: "domiciliario",
      titulo: "Domiciliario",
      subtitulo: "Entrega y cobro con link temporal",
      icono: "🛵",
      quien: "Quien lleva el pedido; recibe un link de entrega que expira en 2 horas",
      accesos: [
        {
          href: `/panel?slug=${business.slug}`,
          titulo: "Generar link de entrega",
          descripcion:
            "Desde el panel, el operador genera y envía por WhatsApp el link de confirmación de entrega al domiciliario.",
          icono: "🔗"
        }
      ]
    }
  ];

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      {/* Encabezado con marca */}
      <header
        className="px-6 py-10"
        style={{ backgroundColor: brandColor, color: brandTextColor }}
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              className="h-20 w-20 rounded-3xl border border-white/50 bg-white object-contain p-2 shadow-lg"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-3xl border-2 border-white/30 bg-white/20 text-3xl shadow-lg">
              🛒
            </div>
          )}
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">{business.name}</h1>
            <p className="mt-1 text-sm font-medium opacity-90">
              Centro de gestión · accede a todas las funcionalidades desde un solo lugar
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        {perfiles.map((perfil) => (
          <section key={perfil.id} aria-labelledby={`perfil-${perfil.id}`} className="mt-8">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-xl">{perfil.icono}</span>
              <h2 id={`perfil-${perfil.id}`} className="text-lg font-extrabold text-slate-800">
                {perfil.titulo}
              </h2>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{perfil.subtitulo}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">{perfil.quien}</p>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {perfil.accesos.map((acceso) => (
                <AccesoRow key={acceso.titulo} acceso={acceso} brandColor={brandColor} />
              ))}
            </div>
          </section>
        ))}

        {/* Nota aclaratoria de perfiles */}
        <section className="mt-10 rounded-3xl border border-slate-100 bg-white px-6 py-6 shadow-sm">
          <h2 className="text-base font-extrabold text-slate-800">¿Cómo se conectan los perfiles?</h2>
          <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-600">
            <li>
              <strong className="text-slate-800">1.</strong> El <strong>operador</strong> (dueño)
              crea el pedido en el panel e inicia el flujo enviando el tiquete con QR por WhatsApp.
            </li>
            <li>
              <strong className="text-slate-800">2.</strong> El <strong>cliente</strong> (usuario)
              recibe ese link, consulta su tiquete y hace seguimiento de su pedido.
            </li>
            <li>
              <strong className="text-slate-800">3.</strong> El <strong>domiciliario</strong> recibe
              un link de entrega temporal (expira en 2 horas) para confirmar la entrega y cobrar el saldo.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
