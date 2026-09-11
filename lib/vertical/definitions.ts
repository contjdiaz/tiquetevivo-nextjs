/**
 * Vertical registry — the single source of truth the generalized engine uses
 * to serve each vertical (fruver, lavanderia, …) through the same surfaces:
 * public catalog endpoint, advertising renderer, public pages and owner panel.
 *
 * A vertical definition declares:
 *   - `path`: the public URL segment (e.g. `/lavanderia/[businessSlug]`);
 *   - how to match it from the business config (`name`/`vertical_slug`) and
 *     from the business slug (fallback used when the vertical slug is missing);
 *   - the story they render on shared components: fallback emoji, default brand
 *     color when the business has none, and the brand-header eyebrow;
 *   - `catalogKind`: whether the public catalog is backed by `products`
 *     (fruver) or by `services_config` (lavanderia).
 *
 * This module is pure and free of I/O so it can run on the server and in the
 * browser and be verified by property-based tests.
 */

import type { getVerticalTheme } from "./brand";

/** How a vertical's public catalog is sourced. */
export type CatalogKind = "products" | "services";

export interface VerticalDefinition {
  /** Slug in the `verticals` table (also used as `quotes.vertical_slug`). */
  slug: string;
  /** Public URL segment, e.g. `fruver` → `/fruver/[businessSlug]`. */
  path: string;
  /** Accent/case-insensitive keywords matched against the vertical name. */
  nameKeywords: string[];
  /** Business-slug prefixes matched when the vertical slug is unknown. */
  businessSlugPrefixes: string[];
  /** Emoji shown when the business has no logo. */
  fallbackEmoji: string;
  /** Brand color used when the business has no valid color. */
  defaultColor: string;
  /** Subtitle shown under the business name on the brand header. */
  eyebrow: string;
  /** Where the public catalog items come from. */
  catalogKind: CatalogKind;
}

const FRUVER: VerticalDefinition = {
  slug: "fruver",
  path: "fruver",
  nameKeywords: ["fruver", "frut", "verdur"],
  businessSlugPrefixes: ["fruver"],
  fallbackEmoji: "🛒",
  defaultColor: "#16a34a",
  eyebrow: "Centro de pedidos y entregas",
  catalogKind: "products",
};

const LAVANDERIA: VerticalDefinition = {
  slug: "lavanderia",
  path: "lavanderia",
  nameKeywords: ["lavanderia", "lavandero", "lavado", "laundry", "tintor"],
  businessSlugPrefixes: ["lavanderia", "maktub"],
  fallbackEmoji: "🧺",
  defaultColor: "#1f4e8c",
  eyebrow: "Centro de servicios de lavandería",
  catalogKind: "services",
};

/** Every vertical known to the generalized engine. */
export const VERTICAL_DEFINITIONS: readonly VerticalDefinition[] = [
  FRUVER,
  LAVANDERIA,
];

/** Registry indexed by vertical slug for fast lookups. */
export const VERTICAL_DEFINITIONS_BY_SLUG: Readonly<Record<string, VerticalDefinition>> =
  Object.fromEntries(VERTICAL_DEFINITIONS.map((v) => [v.slug, v])) as Record<
    string,
    VerticalDefinition
  >;

/** Registry indexed by URL path segment for route lookups. */
export const VERTICAL_DEFINITIONS_BY_PATH: Readonly<Record<string, VerticalDefinition>> =
  Object.fromEntries(VERTICAL_DEFINITIONS.map((v) => [v.path, v])) as Record<
    string,
    VerticalDefinition
  >;

/** Vertical slugs backed by a public catalog (`products` or `services`). */
export const CATALOG_VERTICALS: readonly string[] = VERTICAL_DEFINITIONS.map(
  (v) => v.slug,
);

/**
 * Resolve the vertical definition by its slug, or `null` when unknown.
 */
export function getVerticalDefinition(
  slug: string | null | undefined,
): VerticalDefinition | null {
  if (!slug) return null;
  return VERTICAL_DEFINITIONS_BY_SLUG[slug] ?? null;
}

/**
 * Normalizes a string for accent/case-insensitive comparison.
 */
function normalize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Inputs routinely available when matching a business to a vertical. */
export interface VerticalMatchHints {
  /** `vertical_slug` from the business config (authoritative when present). */
  verticalSlug?: string | null;
  /** `vertical_name` from the business config (e.g. "Lavandería"). */
  verticalName?: string | null;
  /** Business slug (fallback when the vertical slug is unknown). */
  businessSlug?: string | null;
}

/**
 * Matches a business to a vertical using, in order of precedence:
 *   1. the authoritative `vertical_slug` (exact slug match);
 *   2. the vertical display name (accent/case-insensitive keyword match);
 *   3. the business slug prefix (loosest fallback).
 *
 * Returns the matching definition or `null`.
 */
export function matchVertical(hints: VerticalMatchHints): VerticalDefinition | null {
  const slug = normalize(hints.verticalSlug);
  if (slug) {
    const bySlug = getVerticalDefinition(slug);
    if (bySlug) return bySlug;
  }

  const name = normalize(hints.verticalName);
  const businessSlug = normalize(hints.businessSlug);

  for (const definition of VERTICAL_DEFINITIONS) {
    if (definition.nameKeywords.some((keyword) => name.includes(keyword))) {
      return definition;
    }
  }

  for (const definition of VERTICAL_DEFINITIONS) {
    if (
      definition.businessSlugPrefixes.some((prefix) =>
        businessSlug.startsWith(prefix),
      )
    ) {
      return definition;
    }
  }

  return null;
}

/**
 * Convenience: is the matched vertical equal to `slug` (e.g. `isVertical(hints, "fruver")`)?
 */
export function isVertical(
  hints: VerticalMatchHints,
  slug: string,
): boolean {
  return matchVertical(hints)?.slug === slug;
}

// Keep `getVerticalTheme` / `readableTextColor` / `DEFAULT_BRAND_COLOR` linked
// here so engine consumers can import the vertical story tokens in one place.
export type VerticalTheme = ReturnType<typeof getVerticalTheme>;
export type { VerticalTheme as VerticalStoryTokens };