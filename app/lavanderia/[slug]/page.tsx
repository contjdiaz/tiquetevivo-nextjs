import { Suspense } from "react";
import { handler as publicCatalogHandler } from "@/app/api/public-catalog/impl";
import ServiceQuoteBuilder from "./ServiceQuoteBuilder";
import type { PublicService } from "@/lib/lavanderia/types";
import type { PublicPromotionAny } from "@/lib/fruver/sanitize";
import type { AdvertisingBlocks } from "@/lib/fruver/advertising";

// The catalog reflects current service prices; never cache it.
export const dynamic = "force-dynamic";

interface PublicBusiness {
  slug: string;
  name: string;
  color: string | null;
  logo_url: string | null;
}

interface CatalogData {
  business: PublicBusiness;
  services: PublicService[];
  promotions: PublicPromotionAny[];
  advertising: AdvertisingBlocks;
}

/**
 * SSR the public lavanderia catalog by invoking the public-catalog handler on
 * the server (same sanitized projection the browser would receive). The active
 * services and vigent promotions are handed to the ServiceQuoteBuilder client
 * island, which computes the Total_Estimado locally without round-trips.
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

function CatalogFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-700" />
    </main>
  );
}

export default async function LavanderiaCatalogPage({
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
          <h1 className="text-xl font-semibold text-slate-800">Catálogo no disponible</h1>
          <p className="mt-2 text-slate-500">
            No encontramos este negocio o su catálogo no está publicado.
          </p>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={<CatalogFallback />}>
      <ServiceQuoteBuilder
        slug={data.business.slug}
        business={data.business}
        services={data.services}
        promotions={data.promotions}
        advertising={data.advertising}
      />
    </Suspense>
  );
}