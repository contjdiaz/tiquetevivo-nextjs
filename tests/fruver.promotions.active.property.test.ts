/**
 * Property-based test for promotion validity selection.
 *
 * Feature: fruver-catalog-quoting, Property 7: Vigencia de promociones
 *
 * Validates: Requirements 3.6, 3.7, 4.1, 4.3, 4.5
 *
 * Para todo conjunto de Promociones y un instante `now`, `getActivePromotions`
 * devuelve exactamente aquellas Promociones con `active = true` cuyo `now` cae
 * dentro de `[starts_at, ends_at]`, y ninguna otra (excluyendo inactivas y
 * fuera de ventana).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { getActivePromotions } from "@/lib/fruver/promotions";
import type { Promotion, PromotionType } from "@/lib/fruver/types";

const promotionTypeArb: fc.Arbitrary<PromotionType> = fc.constantFrom(
  "banner",
  "combo",
  "discount_code",
);

/** Bounded epoch millisecond range so windows and `now` overlap frequently. */
const MIN_MS = Date.UTC(2020, 0, 1);
const MAX_MS = Date.UTC(2030, 0, 1);

const timestampMsArb: fc.Arbitrary<number> = fc.integer({ min: MIN_MS, max: MAX_MS });

/**
 * A promotion whose validity window is well-formed (`starts_at <= ends_at`)
 * and whose dates parse to valid ISO strings. `active` is generated freely so
 * the filter must exclude inactive promotions.
 */
const promotionArb: fc.Arbitrary<Promotion> = fc
  .tuple(timestampMsArb, timestampMsArb)
  .map(([a, b]) => (a <= b ? [a, b] : [b, a]) as [number, number])
  .chain(([startsMs, endsMs]) =>
    fc.record({
      id: fc.uuid(),
      business_id: fc.uuid(),
      type: promotionTypeArb,
      text: fc.option(fc.string({ maxLength: 40 }), { nil: null }),
      code: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
      discount_percent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
      product_ids: fc.option(fc.array(fc.uuid(), { maxLength: 5 }), { nil: null }),
      starts_at: fc.constant(new Date(startsMs).toISOString()),
      ends_at: fc.constant(new Date(endsMs).toISOString()),
      active: fc.boolean(),
      created_at: fc.constant(new Date(startsMs).toISOString()),
      updated_at: fc.constant(new Date(startsMs).toISOString()),
    }),
  );

/** Reference predicate mirroring the property statement independently. */
function isVigente(promotion: Promotion, nowMs: number): boolean {
  if (!promotion.active) return false;
  const startsMs = Date.parse(promotion.starts_at);
  const endsMs = Date.parse(promotion.ends_at);
  if (Number.isNaN(startsMs) || Number.isNaN(endsMs)) return false;
  return startsMs <= nowMs && nowMs <= endsMs;
}

describe("Feature: fruver-catalog-quoting, Property 7: Vigencia de promociones", () => {
  it("returns exactly the active promotions whose window contains now", () => {
    /** Validates: Requirements 3.6, 3.7, 4.1, 4.3, 4.5 */
    fc.assert(
      fc.property(
        fc.array(promotionArb, { maxLength: 40 }),
        timestampMsArb,
        (promotions, nowMs) => {
          const now = new Date(nowMs);
          const result = getActivePromotions(promotions, now);

          const expected = promotions.filter((p) => isVigente(p, nowMs));

          // Same set of promotions, preserving input order.
          expect(result).toEqual(expected);

          // Every returned promotion is active and within its window.
          for (const promotion of result) {
            expect(promotion.active).toBe(true);
            expect(Date.parse(promotion.starts_at)).toBeLessThanOrEqual(nowMs);
            expect(Date.parse(promotion.ends_at)).toBeGreaterThanOrEqual(nowMs);
          }

          // No excluded promotion (inactive or out of window) is returned.
          for (const promotion of promotions) {
            if (!isVigente(promotion, nowMs)) {
              expect(result).not.toContain(promotion);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("excludes inactive promotions even when now is inside their window", () => {
    /** Validates: Requirements 3.6 */
    const now = new Date("2024-06-15T00:00:00.000Z");
    const base = {
      id: "p1",
      business_id: "b1",
      type: "banner" as const,
      text: "Oferta",
      code: null,
      discount_percent: null,
      product_ids: null,
      starts_at: "2024-06-01T00:00:00.000Z",
      ends_at: "2024-06-30T00:00:00.000Z",
      created_at: "2024-06-01T00:00:00.000Z",
      updated_at: "2024-06-01T00:00:00.000Z",
    };

    expect(getActivePromotions([{ ...base, active: false }], now)).toEqual([]);
    expect(getActivePromotions([{ ...base, active: true }], now)).toEqual([
      { ...base, active: true },
    ]);
  });

  it("excludes active promotions when now is outside the inclusive window", () => {
    /** Validates: Requirements 3.7 */
    const base = {
      id: "p1",
      business_id: "b1",
      type: "banner" as const,
      text: "Oferta",
      code: null,
      discount_percent: null,
      product_ids: null,
      starts_at: "2024-06-01T00:00:00.000Z",
      ends_at: "2024-06-30T00:00:00.000Z",
      active: true,
      created_at: "2024-06-01T00:00:00.000Z",
      updated_at: "2024-06-01T00:00:00.000Z",
    };

    // Before the window.
    expect(
      getActivePromotions([base], new Date("2024-05-31T23:59:59.999Z")),
    ).toEqual([]);
    // After the window.
    expect(
      getActivePromotions([base], new Date("2024-06-30T00:00:00.001Z")),
    ).toEqual([]);
    // On the inclusive boundaries.
    expect(getActivePromotions([base], new Date(base.starts_at))).toEqual([base]);
    expect(getActivePromotions([base], new Date(base.ends_at))).toEqual([base]);
  });
});
