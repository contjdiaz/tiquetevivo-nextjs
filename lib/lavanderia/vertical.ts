/**
 * Lavanderia vertical detection for the owner panel and shared engine.
 *
 * Delegates to the generalized `matchVertical` engine: the authoritative
 * `vertical_slug` from the business config wins, then the vertical display
 * name (accent/case-insensitive), then the business slug prefix.
 *
 * Pure and DOM-free so it can be unit-tested without rendering the panel.
 */

import { matchVertical, type VerticalMatchHints } from "@/lib/vertical/definitions";

/**
 * Returns `true` when the active business belongs to the lavanderia vertical.
 *
 * Matches the vertical slug "lavanderia", a name mentioning launder/laundry
 * (lavanderia, lavado, laundry, tintor) or a business slug prefixed with
 * "lavanderia" / "maktub".
 */
export function isLavanderiaVertical(hints: VerticalMatchHints): boolean {
  return matchVertical(hints)?.slug === "lavanderia";
}