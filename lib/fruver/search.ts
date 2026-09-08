/**
 * Client-side catalog search for the public fruver page.
 *
 * Pure, DOM-free helpers so they can be unit- and property-tested. Filtering
 * happens entirely on the client over the already-loaded catalog: no extra
 * round-trips or endpoints (R2.1, R2.5).
 */

import type { PublicProduct } from "@/lib/fruver/types";

/**
 * Normalizes a string for case- and accent-insensitive comparison.
 *
 * Lowercases, strips diacritics (á → a, ñ → n) via Unicode decomposition, and
 * trims surrounding whitespace.
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFD")
    // Remove combining diacritical marks left by NFD decomposition.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filters a catalog by product-name match (case/accent-insensitive).
 *
 * An empty (or whitespace-only) query returns the full catalog unchanged.
 * Otherwise returns the subset of products whose normalized name contains the
 * normalized query, preserving the original order (R2.1, R2.5).
 */
export function filterProducts(
  products: PublicProduct[],
  query: string
): PublicProduct[] {
  const normalizedQuery = normalizeSearch(query);
  if (normalizedQuery === "") return products;
  return products.filter((p) =>
    normalizeSearch(p.name).includes(normalizedQuery)
  );
}
