/**
 * Pure promotion validity module for the "fruver" vertical.
 *
 * `getActivePromotions` selects the promotions that are currently in effect:
 * those marked `active` whose validity window `[starts_at, ends_at]` contains
 * the provided instant `now`. It is free of I/O so it can be shared by the
 * public catalog endpoint, the advertising renderer and the promotions
 * manager, and verified with property-based tests (R3.6, R3.7).
 */

import type { Promotion } from "./types";

/**
 * Returns only the promotions that are active and whose validity window
 * contains `now`, using an inclusive `[starts_at, ends_at]` interval
 * (R3.6, R3.7).
 *
 * A promotion is considered vigente (in effect) when all of the following
 * hold:
 * - `active === true`;
 * - `starts_at` and `ends_at` parse to valid timestamps;
 * - `starts_at <= now <= ends_at`.
 *
 * Inactive promotions, promotions outside their window, and promotions with
 * unparseable dates are excluded. Input order is preserved and the input
 * array is not mutated.
 *
 * @param promotions - Candidate promotions to filter.
 * @param now - The reference instant used to evaluate each validity window.
 * @returns The subset of promotions currently in effect.
 */
export function getActivePromotions(
  promotions: Promotion[],
  now: Date
): Promotion[] {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];

  return promotions.filter((promotion) => {
    if (!promotion.active) return false;

    const startsMs = Date.parse(promotion.starts_at);
    const endsMs = Date.parse(promotion.ends_at);
    if (Number.isNaN(startsMs) || Number.isNaN(endsMs)) return false;

    return startsMs <= nowMs && nowMs <= endsMs;
  });
}
