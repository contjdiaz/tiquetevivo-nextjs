/**
 * Fruver vertical detection for the owner panel and shared engine (R4.1,
 * R5.4, R6.1).
 *
 * Delegates to the generalized `matchVertical` engine: the authoritative
 * `vertical_slug` from the business config wins, then the vertical display
 * name (accent/case-insensitive), then the business slug prefix.
 *
 * Pure and DOM-free so it can be unit-tested without rendering the panel.
 */

import { matchVertical, type VerticalMatchHints } from "@/lib/vertical/definitions";

/** Backwards-compatible alias of the hints used for vertical matching. */
export type VerticalHints = VerticalMatchHints;

/**
 * Returns `true` when the active business belongs to the fruver vertical.
 *
 * Matches the vertical slug "fruver", a name mentioning fruits/vegetables
 * (fruver, "frutas", "verduras") or a business slug prefixed with "fruver".
 */
export function isFruverVertical(hints: VerticalMatchHints): boolean {
  return matchVertical(hints)?.slug === "fruver";
}