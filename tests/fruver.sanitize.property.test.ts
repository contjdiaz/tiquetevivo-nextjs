/**
 * Property-based tests for public data sanitization (whitelist projections).
 *
 * Feature: fruver-catalog-quoting, Property 10: Sanitización de datos públicos (whitelist)
 *
 * Validates: Requirements 4.6, 5.6, 10.3
 *
 * Para toda entidad Producto o Promocion con campos internos, su proyección
 * pública (`toPublicProduct` / `toPublicPromotion`) contiene únicamente los
 * campos de la lista blanca y nunca campos sensibles como `business_id`,
 * identificadores internos u otros no declarados en las interfaces `Public*`.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { toPublicProduct, toPublicPromotion } from "@/lib/fruver/sanitize";
import type { Product, Promotion, SaleUnit } from "@/lib/fruver/types";

/**
 * Internal/tenant fields that MUST NEVER appear in any public projection.
 * These mirror the sensitive columns on the underlying `products`/`promotions`
 * tables (R4.6, R5.6, R10.3).
 */
const FORBIDDEN_FIELDS = [
  "business_id",
  "customer_id",
  "active",
  "created_at",
  "updated_at",
  "starts_at"
] as const;

/** Allowed keys for the public product projection. */
const ALLOWED_PRODUCT_KEYS = [
  "id",
  "name",
  "unit",
  "day_price",
  "photo_url",
  "is_seasonal"
];

/** Allowed keys per public promotion type. */
const ALLOWED_PROMOTION_KEYS: Record<string, string[]> = {
  banner: ["type", "text", "ends_at"],
  combo: ["type", "product_ids", "discount_percent", "ends_at"],
  discount_code: ["type", "code", "discount_percent", "ends_at"]
};

const saleUnitArb: fc.Arbitrary<SaleUnit> = fc.constantFrom("kg", "libra", "unidad");

/** ISO-8601 timestamp arbitrary constrained to valid dates. */
const isoDateArb = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2100-01-01T00:00:00Z"),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

/** Generate a full Product including all internal/tenant fields. */
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

/** Generate a full Promotion (any type) including all internal/tenant fields. */
const promotionArb: fc.Arbitrary<Promotion> = fc
  .constantFrom<Promotion["type"]>("banner", "combo", "discount_code")
  .chain((type) =>
    fc.record({
      id: fc.uuid(),
      business_id: fc.uuid(),
      type: fc.constant(type),
      text: fc.option(fc.string({ maxLength: 120 }), { nil: null }),
      code: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
      discount_percent: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
      product_ids: fc.option(fc.array(fc.uuid(), { maxLength: 8 }), { nil: null }),
      starts_at: isoDateArb,
      ends_at: isoDateArb,
      active: fc.boolean(),
      created_at: isoDateArb,
      updated_at: isoDateArb
    })
  );

describe("Feature: fruver-catalog-quoting, Property 10: Sanitización de datos públicos (whitelist)", () => {
  it("toPublicProduct exposes only whitelisted keys and never internal fields", () => {
    /** Validates: Requirements 5.6, 10.3 */
    fc.assert(
      fc.property(productArb, (product) => {
        const publicProduct = toPublicProduct(product);
        const keys = Object.keys(publicProduct);

        // Every key present must be in the allow-list.
        for (const key of keys) {
          expect(ALLOWED_PRODUCT_KEYS).toContain(key);
        }

        // No forbidden internal/tenant field may leak through.
        for (const forbidden of FORBIDDEN_FIELDS) {
          expect(publicProduct).not.toHaveProperty(forbidden);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("toPublicPromotion exposes only whitelisted keys per type and never internal fields", () => {
    /** Validates: Requirements 4.6, 10.3 */
    fc.assert(
      fc.property(promotionArb, (promotion) => {
        const publicPromotion = toPublicPromotion(promotion);
        const keys = Object.keys(publicPromotion);
        const allowed = ALLOWED_PROMOTION_KEYS[publicPromotion.type];

        // The projected type must be a known public promotion type.
        expect(allowed).toBeDefined();

        // Every key present must be in the allow-list for its type.
        for (const key of keys) {
          expect(allowed).toContain(key);
        }

        // No forbidden internal/tenant field may leak through.
        for (const forbidden of FORBIDDEN_FIELDS) {
          expect(publicPromotion).not.toHaveProperty(forbidden);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("public projections never contain business_id, customer_id, active or internal timestamps", () => {
    /** Validates: Requirements 4.6, 5.6, 10.3 */
    fc.assert(
      fc.property(productArb, promotionArb, (product, promotion) => {
        const projections = [toPublicProduct(product), toPublicPromotion(promotion)];

        for (const projection of projections) {
          for (const forbidden of FORBIDDEN_FIELDS) {
            expect(Object.prototype.hasOwnProperty.call(projection, forbidden)).toBe(false);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
