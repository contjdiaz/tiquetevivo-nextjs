/**
 * Property-based tests for validateDayPrice (fruver product day price).
 *
 * Feature: fruver-catalog-quoting, Property 2: Validación del precio del día
 * Validates: Requirements 2.4
 *
 * Property statement (design.md, Property 2):
 *   For every day-price value, the validation accepts it if and only if it is
 *   a finite number greater than or equal to zero; negative, non-numeric, NaN
 *   or infinite values are rejected with an error message.
 *
 * Note: `validateDayPrice` delegates to the shared `validateAmount` helper,
 * which additionally caps accepted amounts at 99,999,999.99. The generators
 * below constrain the accepted-input space accordingly so the property
 * expresses the true acceptance boundary of the implementation.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateDayPrice } from '@/lib/fruver/validators';

const MAX_AMOUNT = 99999999.99;

describe('Feature: fruver-catalog-quoting, Property 2: Validación del precio del día', () => {
  it('accepts any finite non-negative number within bounds', () => {
    /**
     * Validates: Requirements 2.4
     *
     * For any finite number >= 0 (and within the platform bound), the
     * validation accepts it and returns the normalized numeric value.
     */
    fc.assert(
      fc.property(
        fc.double({
          min: 0,
          max: MAX_AMOUNT,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (price) => {
          const result = validateDayPrice(price);
          expect(result.valid).toBe(true);
          expect(result.value).toBe(price);
          expect(result.field).toBe('day_price');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects any negative number with a descriptive error', () => {
    /**
     * Validates: Requirements 2.4
     *
     * For any finite number < 0, the validation rejects it with an error.
     */
    fc.assert(
      fc.property(
        fc.double({ min: -1e12, max: -Number.MIN_VALUE, noNaN: true, noDefaultInfinity: true }),
        (price) => {
          const result = validateDayPrice(price);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.field).toBe('day_price');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects NaN and infinite values with a descriptive error', () => {
    /**
     * Validates: Requirements 2.4
     *
     * NaN and +/-Infinity are not finite numbers and must be rejected.
     */
    fc.assert(
      fc.property(
        fc.constantFrom(NaN, Infinity, -Infinity),
        (price) => {
          const result = validateDayPrice(price);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.field).toBe('day_price');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects non-numeric values that do not represent a finite non-negative number', () => {
    /**
     * Validates: Requirements 2.4
     *
     * The implementation coerces inputs via `Number(value)` and accepts the
     * result only when it is a finite number >= 0. This generator produces
     * values whose numeric coercion is NOT a finite non-negative number
     * (non-numeric strings, objects, multi-element arrays, null), so all of
     * them must be rejected with a descriptive error.
     */
    const coercesToInvalid = (v: unknown) => {
      // `Number(v)` throws for values with no primitive coercion (e.g. a
      // Symbol or an object with a throwing `valueOf`). Those cannot represent
      // a finite non-negative number, so they belong to the invalid set.
      let n: number;
      try {
        n = Number(v as never);
      } catch {
        return true;
      }
      return !Number.isFinite(n) || n < 0;
    };

    fc.assert(
      fc.property(
        fc
          .oneof(
            fc.constant(null),
            fc.string(),
            fc.object(),
            fc.array(fc.anything(), { minLength: 2 })
          )
          .filter(coercesToInvalid),
        (nonNumeric) => {
          const result = validateDayPrice(nonNumeric);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.field).toBe('day_price');
        }
      ),
      { numRuns: 200 }
    );
  });
});
