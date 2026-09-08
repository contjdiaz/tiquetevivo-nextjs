/**
 * Property-based tests for reconcileFrequentList (frequent-list reconciliation).
 *
 * Feature: fruver-catalog-quoting, Property 18: Reconciliación de lista frecuente contra el catálogo actual
 * Validates: Requirements 8.2, 8.3, 8.4
 *
 * Property statement (design.md, Property 18):
 *   Para toda Lista_Frecuente y catálogo, `reconcileFrequentList` devuelve
 *   líneas únicamente para Productos activos existentes (con `day_price`
 *   vigente del catálogo actual) y reporta como no disponibles todos los
 *   Productos guardados que estén inactivos o inexistentes.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  reconcileFrequentList,
  type SavedFrequentLine,
} from '@/lib/fruver/quote-calculator';
import { SALE_UNITS, type Product } from '@/lib/fruver/types';

// Generator for a full catalog Product. `active` is chosen freely so the
// generated catalog contains a realistic mix of active and inactive items.
const productArb: fc.Arbitrary<Product> = fc.record({
  id: fc.uuid(),
  business_id: fc.uuid(),
  name: fc.string(),
  unit: fc.constantFrom(...SALE_UNITS),
  day_price: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
  photo_url: fc.option(fc.webUrl(), { nil: null }),
  is_seasonal: fc.boolean(),
  active: fc.boolean(),
  // Timestamps are irrelevant to reconciliation; use a constant valid ISO
  // string to avoid invalid-date edge cases from unconstrained fc.date().
  created_at: fc.constant('2024-01-01T00:00:00.000Z'),
  updated_at: fc.constant('2024-01-01T00:00:00.000Z'),
});

// A catalog with unique product ids (mirrors the DB primary-key invariant).
const catalogArb: fc.Arbitrary<Product[]> = fc
  .uniqueArray(productArb, { maxLength: 30, selector: (p) => p.id })
  .map((products) => products);

const qtyArb = fc.double({ min: Number.MIN_VALUE, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

/**
 * Builds a saved frequent-list scenario: each saved entry references either a
 * product that exists in the catalog (active or inactive) or a completely
 * unknown id, so the reconciliation must handle all three cases.
 */
const scenarioArb = catalogArb.chain((catalog) => {
  const idArb =
    catalog.length > 0
      ? fc.oneof(fc.constantFrom(...catalog.map((p) => p.id)), fc.uuid())
      : fc.uuid();

  const savedArb = fc.array(
    fc.record({ product_id: idArb, qty: qtyArb }),
    { maxLength: 30 },
  );

  return savedArb.map((saved) => ({ catalog, saved: saved as SavedFrequentLine[] }));
});

describe('Feature: fruver-catalog-quoting, Property 18: Reconciliación de lista frecuente contra el catálogo actual', () => {
  it('rebuilds lines only for active existing products with current catalog prices, reporting the rest as unavailable', () => {
    /**
     * Validates: Requirements 8.2, 8.3, 8.4
     *
     * For any saved frequent list and any current catalog:
     *  - a rebuilt line exists iff the saved product still exists AND is active,
     *  - each rebuilt line uses the current catalog `day_price`, `name` and
     *    `unit` (never stale saved data) while preserving the saved `qty`,
     *  - every saved product that is inactive or missing is reported by id in
     *    `unavailable`,
     *  - lines + unavailable together account for every saved entry (complete,
     *    order-preserving partition).
     */
    fc.assert(
      fc.property(scenarioArb, ({ catalog, saved }) => {
        const activeById = new Map<string, Product>();
        for (const p of catalog) {
          if (p.active) activeById.set(p.id, p);
        }

        const { lines, unavailable } = reconcileFrequentList(saved, catalog);

        // Complete, disjoint partition: every saved entry is either a rebuilt
        // line or reported unavailable, with no drops or duplicates.
        expect(lines.length + unavailable.length).toBe(saved.length);

        // Expected partition derived directly from the availability predicate,
        // order-preserving.
        const expectedLineEntries = saved.filter((s) => activeById.has(s.product_id));
        const expectedUnavailable = saved
          .filter((s) => !activeById.has(s.product_id))
          .map((s) => s.product_id);

        expect(unavailable).toEqual(expectedUnavailable);

        // Rebuilt lines must reference only active existing products (R8.2),
        // carry the current catalog price/name/unit (R8.3) and keep saved qty.
        expect(lines).toEqual(
          expectedLineEntries.map((s) => {
            const product = activeById.get(s.product_id)!;
            return {
              product_id: product.id,
              name: product.name,
              unit: product.unit,
              day_price: product.day_price,
              qty: s.qty,
            };
          }),
        );

        // Explicitly assert every rebuilt line comes from an active product and
        // that no inactive/missing product leaked into the lines (R8.4).
        for (const line of lines) {
          const product = activeById.get(line.product_id);
          expect(product).toBeDefined();
          expect(product!.active).toBe(true);
          expect(line.day_price).toBe(product!.day_price);
          expect(line.name).toBe(product!.name);
          expect(line.unit).toBe(product!.unit);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('reports every saved product as unavailable when the catalog has no active products', () => {
    /**
     * Validates: Requirements 8.4
     *
     * Focused scenario: all catalog products are inactive, so nothing can be
     * rebuilt and every saved product id is reported as unavailable.
     */
    const inactiveProductArb: fc.Arbitrary<Product> = productArb.map((p) => ({
      ...p,
      active: false,
    }));

    const scenario = fc
      .uniqueArray(inactiveProductArb, { maxLength: 20, selector: (p) => p.id })
      .chain((catalog) => {
        const idArb =
          catalog.length > 0
            ? fc.oneof(fc.constantFrom(...catalog.map((p) => p.id)), fc.uuid())
            : fc.uuid();
        return fc
          .array(fc.record({ product_id: idArb, qty: qtyArb }), { maxLength: 20 })
          .map((saved) => ({ catalog, saved: saved as SavedFrequentLine[] }));
      });

    fc.assert(
      fc.property(scenario, ({ catalog, saved }) => {
        const { lines, unavailable } = reconcileFrequentList(saved, catalog);
        expect(lines).toHaveLength(0);
        expect(unavailable).toEqual(saved.map((s) => s.product_id));
      }),
      { numRuns: 100 },
    );
  });

  it('rebuilds every saved line with current prices when all referenced products are active', () => {
    /**
     * Validates: Requirements 8.2, 8.3
     *
     * Focused scenario: every saved entry references an active catalog product,
     * so all lines are rebuilt with the current catalog day_price and nothing is
     * reported unavailable.
     */
    const scenario = fc
      .uniqueArray(productArb.map((p) => ({ ...p, active: true })), {
        minLength: 1,
        maxLength: 20,
        selector: (p) => p.id,
      })
      .chain((catalog) =>
        fc
          .array(
            fc.record({
              product_id: fc.constantFrom(...catalog.map((p) => p.id)),
              qty: qtyArb,
            }),
            { maxLength: 20 },
          )
          .map((saved) => ({ catalog, saved: saved as SavedFrequentLine[] })),
      );

    fc.assert(
      fc.property(scenario, ({ catalog, saved }) => {
        const byId = new Map(catalog.map((p) => [p.id, p] as const));
        const { lines, unavailable } = reconcileFrequentList(saved, catalog);

        expect(unavailable).toHaveLength(0);
        expect(lines).toHaveLength(saved.length);
        lines.forEach((line, i) => {
          const product = byId.get(saved[i].product_id)!;
          expect(line.day_price).toBe(product.day_price);
          expect(line.qty).toBe(saved[i].qty);
        });
      }),
      { numRuns: 100 },
    );
  });
});
