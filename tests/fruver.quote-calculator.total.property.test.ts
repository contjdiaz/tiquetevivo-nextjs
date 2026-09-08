/**
 * Property-based test for the estimated total as a weighted sum.
 *
 * Feature: fruver-catalog-quoting, Property 11: Total_Estimado como suma ponderada
 *
 * Validates: Requirements 5.3
 *
 * Para todo conjunto de líneas de cotización válidas, `computeEstimatedTotal`
 * devuelve la suma de `day_price × qty` sobre todas las líneas.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeEstimatedTotal } from "@/lib/fruver/quote-calculator";
import type { QuoteLine, SaleUnit } from "@/lib/fruver/types";

const saleUnitArb: fc.Arbitrary<SaleUnit> = fc.constantFrom("kg", "libra", "unidad");

/**
 * A valid quote line: finite non-negative `day_price` and a finite `qty > 0`.
 * Bounds are kept moderate so that the sum stays within safe floating-point
 * precision and the reference sum matches the implementation exactly.
 */
const validLineArb: fc.Arbitrary<QuoteLine> = fc.record({
  product_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 40 }),
  unit: saleUnitArb,
  day_price: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  qty: fc.double({ min: Math.fround(0.001), max: 1_000, noNaN: true, noDefaultInfinity: true }),
});

describe("Feature: fruver-catalog-quoting, Property 11: Total_Estimado como suma ponderada", () => {
  it("computeEstimatedTotal equals the sum of day_price × qty over all valid lines", () => {
    /** Validates: Requirements 5.3 */
    fc.assert(
      fc.property(fc.array(validLineArb, { maxLength: 50 }), (lines) => {
        const expected = lines.reduce(
          (total, line) => total + line.day_price * line.qty,
          0,
        );

        expect(computeEstimatedTotal(lines)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("an empty selection yields a total of 0", () => {
    /** Validates: Requirements 5.3 */
    expect(computeEstimatedTotal([])).toBe(0);
  });
});
