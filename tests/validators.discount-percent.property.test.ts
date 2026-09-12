/**
 * Property-based tests for validateDiscountPercent function.
 *
 * Feature: fruver-catalog-quoting, Property 6: Validación del porcentaje de descuento
 * Validates: Requirements 3.5
 *
 * Para todo porcentaje de descuento de un Combo o Codigo_Descuento, el
 * Gestor_Promociones lo acepta si y solo si está en el rango cerrado [0, 100];
 * cualquier valor fuera del rango se rechaza con un mensaje de error.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateDiscountPercent } from '@/lib/fruver/validators';

describe('Feature: fruver-catalog-quoting, Property 6: Validación del porcentaje de descuento', () => {
  it('accepts any finite number within the closed range [0, 100]', () => {
    /**
     * Validates: Requirements 3.5
     *
     * For any finite number in [0, 100], validateDiscountPercent returns
     * valid=true and normalizes the value to that same number.
     */
    const inRangeArb = fc.double({ min: 0, max: 100, noNaN: true });

    fc.assert(
      fc.property(inRangeArb, (percent) => {
        const result = validateDiscountPercent(percent);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(percent);
        expect(result.field).toBe('discount_percent');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects any finite number strictly below 0 or strictly above 100', () => {
    /**
     * Validates: Requirements 3.5
     *
     * For any finite number outside the closed range [0, 100],
     * validateDiscountPercent returns valid=false with a descriptive error.
     */
    // Number.MIN_VALUE is too small to move 100 in floating point, so we use a
    // representable margin and additionally filter to guarantee the generated
    // value is strictly outside the closed range [0, 100].
    const outOfRangeArb = fc
      .oneof(
        // Strictly below 0
        fc.double({ min: -1e6, max: -1e-6, noNaN: true }),
        // Strictly above 100
        fc.double({ min: 100 + 1e-6, max: 1e6, noNaN: true })
      )
      .filter((n) => n < 0 || n > 100);

    fc.assert(
      fc.property(outOfRangeArb, (percent) => {
        const result = validateDiscountPercent(percent);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.field).toBe('discount_percent');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects non-numeric values (NaN, Infinity, non-numeric strings, null, undefined, objects)', () => {
    /**
     * Validates: Requirements 3.5
     *
     * For any non-numeric value (values that cannot represent a finite number),
     * validateDiscountPercent returns valid=false with a descriptive error.
     */
    const nonNumericArb = fc.oneof(
      fc.constantFrom(NaN, Infinity, -Infinity, null, undefined),
      // Strings that are not parseable as finite numbers. Note: whitespace-only
      // strings are intentionally excluded — `Number("  ")` is `0`, a valid
      // percentage — so they do not belong to the "non-numeric" class.
      fc
        .string()
        .filter((s) => !Number.isFinite(Number(s)) || s === '')
        .map((s) => (s === '' ? 'not-a-number' : s)),
      fc.constantFrom('abc', 'ten', '12abc', '%50'),
      fc.boolean().map((b) => (b ? {} : [1, 2, 3])),
      fc.object()
    );

    fc.assert(
      fc.property(nonNumericArb, (value) => {
        const result = validateDiscountPercent(value);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.field).toBe('discount_percent');
      }),
      { numRuns: 100 }
    );
  });

  it('accepts iff the value lies in [0, 100] (biconditional across the full numeric line)', () => {
    /**
     * Validates: Requirements 3.5
     *
     * The acceptance is a strict biconditional: validateDiscountPercent accepts
     * a finite number if and only if 0 <= value <= 100.
     */
    const anyNumberArb = fc.double({ min: -1e6, max: 1e6, noNaN: true });

    fc.assert(
      fc.property(anyNumberArb, (percent) => {
        const result = validateDiscountPercent(percent);
        const shouldBeValid = percent >= 0 && percent <= 100;
        expect(result.valid).toBe(shouldBeValid);
      }),
      { numRuns: 100 }
    );
  });

  it('accepts the exact boundary values 0 and 100', () => {
    /**
     * Validates: Requirements 3.5
     *
     * The closed range includes both endpoints, so 0 and 100 are accepted.
     */
    for (const boundary of [0, 100]) {
      const result = validateDiscountPercent(boundary);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(boundary);
    }
  });
});
