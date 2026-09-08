/**
 * Fruver vertical detection for the owner panel (R4.1, R5.4, R6.1).
 *
 * `get-business-config` exposes the vertical's display name (`vertical_name`,
 * e.g. "Frutas y Verduras") and emoji, but not the vertical slug. To decide
 * whether the fruver panel section should mount, we match on the vertical name
 * (accent/case-insensitive) and, as a fallback, on the business slug prefix.
 *
 * Pure and DOM-free so it can be unit-tested without rendering the panel.
 */

/** Normalizes a string for accent/case-insensitive comparison. */
function normalize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface VerticalHints {
  /** Vertical display name from the business config (e.g. "Frutas y Verduras"). */
  verticalName?: string | null;
  /** Business slug (e.g. "fruver-patty"). */
  businessSlug?: string | null;
}

/**
 * Returns `true` when the active business belongs to the fruver vertical.
 *
 * Matches when the vertical name mentions fruits/vegetables (fruver, "frutas",
 * "verduras") or when the business slug is prefixed with "fruver".
 */
export function isFruverVertical(hints: VerticalHints): boolean {
  const name = normalize(hints.verticalName);
  const slug = normalize(hints.businessSlug);

  if (name.includes("fruver")) return true;
  if (name.includes("frut")) return true;
  if (name.includes("verdur")) return true;
  if (slug.startsWith("fruver")) return true;

  return false;
}
