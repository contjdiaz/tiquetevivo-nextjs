/**
 * Property-based tests for validateWindow (Promocion validity window).
 *
 * Feature: fruver-catalog-quoting, Property 5: Validación de la ventana de validez de una Promocion
 * Validates: Requirements 3.4
 *
 * Property statement (design.md, Property 5):
 *   For any pair of dates (start, end), the Gestor_Promociones accepts the
 *   Promocion if and only if `end >= start`; otherwise it rejects it with a
 *   descriptive error message.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateWindow } from '@/lib/fruver/validators';

describe('Feature: fruver-catalog-quoting, Property 5: Validación de la ventana de validez de una Promocion', () => {
  // Generator for valid finite epoch milliseconds within a broad but safe range.
  // Bounds keep values inside the valid JS Date range and avoid NaN timestamps.
  const epochMsArb = fc.integer({ min: 0, max: 4_102_444_800_000 }); // 1970-01-01 .. ~2100-01-01

  const isoFromMs = (ms: number) => new Date(ms).toISOString();

  it('accepts the window if and only if ends_at >= starts_at', () => {
    /**
     * Validates: Requirements 3.4
     *
     * For any pair of valid ISO datetimes, validateWindow returns valid === (end >= start).
     * When valid, it echoes back the normalized window; when invalid, it returns a
     * descriptive error keyed to ends_at.
     */
    fc.assert(
      fc.property(epochMsArb, epochMsArb, (startMs, endMs) => {
        const startsAt = isoFromMs(startMs);
        const endsAt = isoFromMs(endMs);

        const result = validateWindow(startsAt, endsAt);
        const expectedValid = endMs >= startMs;

        expect(result.valid).toBe(expectedValid);

        if (expectedValid) {
          expect(result.value).toEqual({ starts_at: startsAt, ends_at: endsAt });
        } else {
          expect(result.field).toBe('ends_at');
          expect(typeof result.error).toBe('string');
          expect(result.error!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('always accepts when ends_at >= starts_at', () => {
    /**
     * Validates: Requirements 3.4
     *
     * Focused generator: end is constructed to be greater than or equal to start,
     * so validateWindow must always accept.
     */
    const orderedArb = fc
      .tuple(epochMsArb, fc.integer({ min: 0, max: 1_000_000_000_000 }))
      .map(([startMs, delta]) => {
        const clampedStart = Math.min(startMs, 4_102_444_800_000);
        const endMs = Math.min(clampedStart + delta, 4_102_444_800_000);
        return [clampedStart, endMs] as const;
      });

    fc.assert(
      fc.property(orderedArb, ([startMs, endMs]) => {
        const startsAt = isoFromMs(startMs);
        const endsAt = isoFromMs(endMs);

        const result = validateWindow(startsAt, endsAt);

        expect(result.valid).toBe(true);
        expect(result.value).toEqual({ starts_at: startsAt, ends_at: endsAt });
      }),
      { numRuns: 200 }
    );
  });

  it('always rejects when ends_at < starts_at', () => {
    /**
     * Validates: Requirements 3.4
     *
     * Focused generator: end is strictly less than start, so validateWindow must
     * always reject with a descriptive error message.
     */
    const invertedArb = fc
      .tuple(fc.integer({ min: 1, max: 4_102_444_800_000 }), fc.integer({ min: 1, max: 1_000_000_000_000 }))
      .map(([startMs, delta]) => {
        const endMs = Math.max(startMs - delta, 0);
        return [startMs, endMs] as const;
      })
      // Ensure the window is genuinely inverted (end strictly before start).
      .filter(([startMs, endMs]) => endMs < startMs);

    fc.assert(
      fc.property(invertedArb, ([startMs, endMs]) => {
        const startsAt = isoFromMs(startMs);
        const endsAt = isoFromMs(endMs);

        const result = validateWindow(startsAt, endsAt);

        expect(result.valid).toBe(false);
        expect(result.field).toBe('ends_at');
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });
});
