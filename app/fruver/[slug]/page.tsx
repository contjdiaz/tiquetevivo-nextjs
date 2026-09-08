import { Suspense } from "react";
import { handler as publicCatalogHandler } from "@/app/api/public-catalog/impl";
import QuoteBuilder from "./QuoteBuilder";
import type { PublicProduct } from "@/lib/fruver/types";
import type { PublicPromotionAny } from "@/lib/fruver/sanitize";
import type { AdvertisingBlocks } from "@/lib/fruver/advertising";

// The catalog reflects daily prices and active products; never cache it.
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
 * SSR the public fruver catalog by invoking the public-catalog handler on the
 * server (same sanitized projection the browser would receive). The catalog
 * and vigent promotions are handed to the QuoteBuilder client island, which
 * computes the Total_Estimado locally without round-trips (R5.1, R5.5, R11.1).
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
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
    </main>
  );
}

export default async function FruverCatalogPage({
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
      <QuoteBuilder
        slug={data.business.slug}
        business={data.business}
        products={data.products}
        promotions={data.promotions}
        advertising={data.advertising}
      />
    </Suspense>
  );
}
