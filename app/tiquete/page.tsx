import { Suspense } from "react";
import { getPublicTicket } from "@/lib/api/public-ticket-data";
import TiqueteClient, { type InitialTicket } from "./TiqueteClient";

// This ticket is per-order and must never be statically cached.
export const dynamic = "force-dynamic";

function TiqueteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
    </main>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Server Component shell for the public ticket.
 *
 * For the slug+number path the ticket is fetched and sanitized on the server
 * (service-role Supabase client, strict field whitelist) so the browser never
 * receives sensitive order data and gets a fully-rendered first paint.
 *
 * The ticket_token path stays client-fetched (the token lives in the URL and
 * the /api/list-orders endpoint already sanitizes that response), so we pass a
 * null initial and let the client island load it.
 */
export default async function TiquetePage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const slug = firstParam(params.slug);
  const number = firstParam(params.number);
  const ticketToken = firstParam(params.ticket_token);

  let initial: InitialTicket | null = null;

  if (!ticketToken && slug && number) {
    const result = await getPublicTicket(slug, number);
    if (result.ok) {
      initial = {
        order: result.data.orders[0],
        business: result.data.business,
        loyalty: result.data.loyalty,
        approval: result.data.approval,
        advertising: result.data.advertising ?? null
      };
    }
  }

  return (
    <Suspense fallback={<TiqueteFallback />}>
      <TiqueteClient initial={initial} />
    </Suspense>
  );
}
