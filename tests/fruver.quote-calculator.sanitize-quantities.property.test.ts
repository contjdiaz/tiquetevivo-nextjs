/**
 * Property-based tests for sanitizeQuantities (invalid quantity rejection).
 *
 * Feature: fruver-catalog-quoting, Property 12: Rechazo de cantidades inválidas
 * Validates: Requirements 5.4
 *
 * Property statement (design.md, Property 12):
 *   For any line with a quantity less than or equal to zero or non-numeric,
 *   `sanitizeQuantities` excludes it from the valid selection and reports it as
 *   rejected; lines with a positive numeric quantity are kept.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeQuantities } from '@/lib/fruver/quote-calculator';
import { SALE_UNITS, type QuoteLine } from '@/lib/fruver/types';

/** A quantity is valid iff it is a finite number strictly greater than zero. */
function isValidQty(qty: unknown): boolean {
  return typeof qty === 'number' && Number.isFinite(qty) && qty > 0;
}

// Generator for a valid, positive numeric quantity.
const validQtyArb = fc.double({ min: Number.MIN_VALUE, max: 1_000_000, noNaN: true, noDefaultInfinity: true });

// Generator for invalid quantities: non-positive numbers, NaN, +/-Infinity and
// non-numeric values (strings, null, undefined, etc.). These are cast to the
// QuoteLine.qty slot to exercise the runtime guard against malformed input.
const invalidQtyArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.double({ min: -1_000_000, max: 0, noNaN: true }), // qty <= 0 (includes 0 and negatives)
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  fc.record({ n: fc.integer() }),
);

// Base line generator (everything except qty), then combined with a qty arbitrary.
const lineWithQtyArb = (qtyArb: fc.Arbitrary<unknown>): fc.Arbitrary<QuoteLine> =>
  fc
    .record({
      product_id: fc.uuid(),
      name: fc.string(),
      unit: fc.constantFrom(...SALE_UNITS),
      day_price: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
      qty: qtyArb,
    })
    .map((r) => r as unknown as QuoteLine);

// A mixed line uses either a valid or an invalid quantity.
const mixedLineArb = fc.oneof(lineWithQtyArb(validQtyArb), lineWithQtyArb(invalidQtyArb));

describe('Feature: fruver-catalog-quoting, Property 12: Rechazo de cantidades inválidas', () => {
  it('partitions lines: valid = positive numeric qty, rejected = qty <= 0 or non-numeric', () => {
    /**
     * Validates: Requirements 5.4
     *
     * For any list of lines (mixing valid and invalid quantities):
     *  - every line with a positive finite numeric qty lands in `valid`,
     *  - every line with qty <= 0 or non-numeric lands in `rejected`,
     *  - the partition is complete and disjoint (no drops, no duplicates),
     *  - relative order within each partition is preserved.
     */
    fc.assert(
      fc.property(fc.array(mixedLineArb, { maxLength: 40 }), (lines) => {
        const { valid, rejected } = sanitizeQuantities(lines);

        // Every valid line has a valid quantity; every rejected line does not.
        expect(valid.every((l) => isValidQty(l.qty))).toBe(true);
        expect(rejected.every((l) => !isValidQty(l.qty))).toBe(true);

        // Partition is complete and disjoint (counts add up).
        expect(valid.length + rejected.length).toBe(lines.length);

        // Expected partition derived directly from the predicate, order-preserving.
        const expectedValid = lines.filter((l) => isValidQty(l.qty));
        const expectedRejected = lines.filter((l) => !isValidQty(l.qty));

        expect(valid).toEqual(expectedValid);
        expect(rejected).toEqual(expectedRejected);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps all lines when every quantity is positive and numeric', () => {
    /**
     * Validates: Requirements 5.4
     *
     * Focused generator: all quantities are valid, so nothing is rejected.
     */
    fc.assert(
      fc.property(fc.array(lineWithQtyArb(validQtyArb), { maxLength: 40 }), (lines) => {
        const { valid, rejected } = sanitizeQuantities(lines);
        expect(valid).toEqual(lines);
        expect(rejected).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects all lines when every quantity is invalid', () => {
    /**
     * Validates: Requirements 5.4
     *
     * Focused generator: all quantities are <= 0 or non-numeric, so nothing is
     * kept in the valid selection.
     */
    fc.assert(
      fc.property(fc.array(lineWithQtyArb(invalidQtyArb), { maxLength: 40 }), (lines) => {
        const { valid, rejected } = sanitizeQuantities(lines);
        expect(valid).toHaveLength(0);
        expect(rejected).toEqual(lines);
      }),
      { numRuns: 200 },
    );
  });
});
