/**
 * Property-based tests for advertising composition without empty blocks.
 *
 * Feature: fruver-catalog-quoting, Property 9: Composición de publicidad sin bloques vacíos
 *
 * Validates: Requirements 4.7
 *
 * Para todo estado de un Negocio fruver sin Promociones, Combos ni
 * Codigo_Descuento vigentes, los bloques de publicidad resultantes están
 * vacíos o nulos (no se produce ningún bloque de publicidad vacío para
 * renderizar).
 *
 * That is: when nothing is in effect, `buildAdvertisingBlocks` returns
 * `promotions`/`combos` as empty arrays and `discountCode` as `null` — never
 * an object/array populated with empty or placeholder content.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildAdvertisingBlocks } from "@/lib/fruver/advertising";
import type { Product, Promotion, SaleUnit } from "@/lib/fruver/types";

const saleUnitArb: fc.Arbitrary<SaleUnit> = fc.constantFrom("kg", "libra", "unidad");

/** Reference instant used to evaluate promotion validity windows. */
const NOW = new Date("2024-06-15T12:00:00Z");

/** Instant strictly before `now` (used to build expired windows). */
const beforeNowArb = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2024-06-15T11:59:59Z"),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

/** Instant strictly after `now` (used to build not-yet-started windows). */
const afterNowArb = fc
  .date({
    min: new Date("2024-06-15T12:00:01Z"),
    max: new Date("2100-01-01T00:00:00Z"),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

const isoDateArb = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2100-01-01T00:00:00Z"),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

const productArb: fc.Arbitrary<Product> = fc.record({
  id: fc.uuid(),
  business_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }),
  unit: saleUnitArb,
  day_price: fc.double({ min: 0, max: 1_000_000, noNaN: true }),
  photo_url: fc.option(fc.webUrl(), { nil: null }),
  is_seasonal: fc.boolean(),
  active: fc.boolean(),
  created_at: isoDateArb,
  updated_at: isoDateArb
});

const promotionTypeArb: fc.Arbitrary<Promotion["type"]> = fc.constantFrom(
  "banner",
  "combo",
  "discount_code"
);

/**
 * Generate a promotion that is NOT in effect at `NOW`. A promotion is out of
 * effect when it is inactive, or when its validity window does not contain
 * `NOW` (fully in the past or fully in the future). We keep every window with
 * `ends_at >= starts_at` so the data mirrors a valid persisted row.
 */
const notInEffectPromotionArb: fc.Arbitrary<Promotion> = promotionTypeArb.chain((type) => {
  const base = {
    id: fc.uuid(),
    business_id: fc.uuid(),
    type: fc.constant(type),
    text: fc.option(fc.string({ maxLength: 120 }), { nil: null }),
    code: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
    discount_percent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    product_ids: fc.option(fc.array(fc.uuid(), { maxLength: 8 }), { nil: null }),
    created_at: isoDateArb,
    updated_at: isoDateArb
  };

  // Case A: inactive with an arbitrary (still valid) window.
  const inactive = fc.record({
    ...base,
    starts_at: beforeNowArb,
    ends_at: afterNowArb,
    active: fc.constant(false)
  });

  // Case B: active but the window is entirely in the past (ends before NOW).
  const expired = fc
    .tuple(beforeNowArb, beforeNowArb)
    .map(([a, b]) => (a <= b ? [a, b] : [b, a]))
    .chain(([starts_at, ends_at]) =>
      fc.record({
        ...base,
        starts_at: fc.constant(starts_at),
        ends_at: fc.constant(ends_at),
        active: fc.constant(true)
      })
    );

  // Case C: active but the window has not started yet (starts after NOW).
  const future = fc
    .tuple(afterNowArb, afterNowArb)
    .map(([a, b]) => (a <= b ? [a, b] : [b, a]))
    .chain(([starts_at, ends_at]) =>
      fc.record({
        ...base,
        starts_at: fc.constant(starts_at),
        ends_at: fc.constant(ends_at),
        active: fc.constant(true)
      })
    );

  return fc.oneof(inactive, expired, future);
});

describe("Feature: fruver-catalog-quoting, Property 9: Composición de publicidad sin bloques vacíos", () => {
  it("returns empty arrays for promotions/combos and null discountCode when nothing is in effect", () => {
    /** Validates: Requirements 4.7 */
    fc.assert(
      fc.property(
        fc.array(productArb, { maxLength: 12 }),
        fc.array(notInEffectPromotionArb, { maxLength: 12 }),
        (products, promotions) => {
          const blocks = buildAdvertisingBlocks({
            vertical_slug: "fruver",
            products,
            promotions,
            promotionsConfig: null,
            now: NOW
          });

          // Promotion-derived blocks must be empty/null — never populated with
          // empty or placeholder content (R4.7).
          expect(Array.isArray(blocks.promotions)).toBe(true);
          expect(blocks.promotions).toHaveLength(0);

          expect(Array.isArray(blocks.combos)).toBe(true);
          expect(blocks.combos).toHaveLength(0);

          expect(blocks.discountCode).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("without any config or in-effect promotions, every optional block is empty or null", () => {
    /** Validates: Requirements 4.7 */
    fc.assert(
      fc.property(
        fc.array(notInEffectPromotionArb, { maxLength: 12 }),
        (promotions) => {
          const blocks = buildAdvertisingBlocks({
            vertical_slug: "fruver",
            products: [],
            promotions,
            promotionsConfig: null,
            now: NOW
          });

          expect(blocks.promotions).toEqual([]);
          expect(blocks.combos).toEqual([]);
          expect(blocks.discountCode).toBeNull();
          // No products and no config -> no seasonal section and no invitation.
          expect(blocks.seasonal).toEqual([]);
          expect(blocks.socialInvite).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
