/**
 * Property-based tests for the seasonal section of the advertising renderer.
 *
 * Feature: fruver-catalog-quoting, Property 8: Sección de temporada del Renderizador_Publicidad
 *
 * Validates: Requirements 4.2
 *
 * Para todo catálogo, el bloque de novedades/temporada contiene exactamente los
 * Productos activos marcados con `is_seasonal = true`, y ningún otro (usando
 * únicamente datos sanitizados vía `toPublicProduct`).
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildAdvertisingBlocks } from "@/lib/fruver/advertising";
import { toPublicProduct } from "@/lib/fruver/sanitize";
import type { Product, SaleUnit } from "@/lib/fruver/types";

const saleUnitArb: fc.Arbitrary<SaleUnit> = fc.constantFrom("kg", "libra", "unidad");

/** ISO-8601 timestamp arbitrary constrained to valid dates. */
const isoDateArb = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2100-01-01T00:00:00Z"),
    noInvalidDate: true
  })
  .map((d) => d.toISOString());

/** Generate a full Product with independently varied `active` and `is_seasonal`. */
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

/** A catalog: a list of products (may be empty), with unique ids. */
const catalogArb: fc.Arbitrary<Product[]> = fc
  .array(productArb, { maxLength: 40 })
  .map((products) => {
    // Ensure unique ids so the "exactly these products" comparison by id is well-defined.
    const seen = new Set<string>();
    return products.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  });

describe("Feature: fruver-catalog-quoting, Property 8: Sección de temporada del Renderizador_Publicidad", () => {
  it("seasonal block contains exactly the active is_seasonal products, sanitized", () => {
    /** Validates: Requirements 4.2 */
    fc.assert(
      fc.property(catalogArb, isoDateArb, (products, nowIso) => {
        const now = new Date(nowIso);

        const { seasonal } = buildAdvertisingBlocks({
          vertical_slug: "fruver",
          products,
          promotions: [],
          promotionsConfig: null,
          now
        });

        // Expected set: active AND is_seasonal, projected to their public shape.
        const expected = products
          .filter((p) => p.active && p.is_seasonal)
          .map(toPublicProduct);

        // Compare by id sets to assert "exactly these and no others".
        const expectedIds = new Set(expected.map((p) => p.id));
        const actualIds = new Set(seasonal.map((p) => p.id));

        expect(actualIds).toEqual(expectedIds);
        expect(seasonal).toHaveLength(expected.length);

        // No inactive product and no non-seasonal product may appear.
        for (const block of seasonal) {
          const source = products.find((p) => p.id === block.id);
          expect(source).toBeDefined();
          expect(source?.active).toBe(true);
          expect(source?.is_seasonal).toBe(true);
        }

        // Every expected product is present with its sanitized projection.
        for (const exp of expected) {
          const found = seasonal.find((p) => p.id === exp.id);
          expect(found).toEqual(exp);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("seasonal blocks are sanitized: never expose internal/tenant fields", () => {
    /** Validates: Requirements 4.2 */
    const forbidden = ["business_id", "active", "created_at", "updated_at", "customer_id"];
    fc.assert(
      fc.property(catalogArb, (products) => {
        const { seasonal } = buildAdvertisingBlocks({
          vertical_slug: "fruver",
          products,
          promotions: [],
          promotionsConfig: null,
          now: new Date("2024-06-01T00:00:00Z")
        });

        for (const block of seasonal) {
          for (const key of forbidden) {
            expect(Object.prototype.hasOwnProperty.call(block, key)).toBe(false);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
