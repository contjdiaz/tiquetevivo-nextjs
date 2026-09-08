/**
 * Property-based tests for validateUnit (Unidad_Venta) of the fruver vertical.
 *
 * Feature: fruver-catalog-quoting, Property 1: Validación de la Unidad_Venta
 * Validates: Requirements 2.2, 2.3
 *
 * Property statement (design.md, Property 1):
 * "Para toda cadena de unidad, la validación del Producto la acepta si y solo
 *  si es exactamente `kg`, `libra` o `unidad`; cualquier otro valor se rechaza
 *  con un mensaje de error descriptivo."
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateUnit } from "@/lib/fruver/validators";
import { SALE_UNITS } from "@/lib/fruver/types";

const ALLOWED_UNITS = SALE_UNITS as readonly string[];

describe("Feature: fruver-catalog-quoting, Property 1: Validación de la Unidad_Venta", () => {
  it("accepts exactly and only the allowed units (kg, libra, unidad)", () => {
    /**
     * Validates: Requirements 2.2, 2.3
     *
     * For every allowed unit, validateUnit accepts it and returns the
     * normalized value.
     */
    fc.assert(
      fc.property(fc.constantFrom(...ALLOWED_UNITS), (unit) => {
        const result = validateUnit(unit);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(unit);
        expect(result.field).toBe("unit");
      }),
      { numRuns: 100 }
    );
  });

  it("rejects any string that is not exactly an allowed unit, with a descriptive error", () => {
    /**
     * Validates: Requirements 2.2, 2.3
     *
     * For any arbitrary string that is not exactly one of the allowed units
     * (matching is case-sensitive), validateUnit rejects it and returns a
     * descriptive error message and no value.
     */
    fc.assert(
      fc.property(
        fc.string().filter((s) => !ALLOWED_UNITS.includes(s)),
        (invalidUnit) => {
          const result = validateUnit(invalidUnit);
          expect(result.valid).toBe(false);
          expect(result.value).toBeUndefined();
          expect(result.field).toBe("unit");
          expect(typeof result.error).toBe("string");
          expect(result.error!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects case and whitespace variants of otherwise-valid units", () => {
    /**
     * Validates: Requirements 2.2, 2.3
     *
     * Acceptance is exact: variations in casing or surrounding whitespace are
     * NOT the canonical value and must be rejected.
     */
    fc.assert(
      fc.property(
        fc
          .constantFrom(...ALLOWED_UNITS)
          .chain((unit) =>
            fc.constantFrom(
              unit.toUpperCase(),
              ` ${unit}`,
              `${unit} `,
              `${unit}s`,
              unit.charAt(0).toUpperCase() + unit.slice(1)
            )
          )
          // Guard against any transform that happens to equal a valid unit.
          .filter((variant) => !ALLOWED_UNITS.includes(variant)),
        (variant) => {
          const result = validateUnit(variant);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects null, undefined and any non-string value with a descriptive error", () => {
    /**
     * Validates: Requirements 2.2, 2.3
     *
     * A missing or non-string Unidad_Venta is not one of the allowed values
     * and must be rejected with a descriptive message.
     */
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.double(),
          fc.boolean(),
          fc.object(),
          fc.array(fc.anything())
        ),
        (nonString) => {
          const result = validateUnit(nonString);
          expect(result.valid).toBe(false);
          expect(result.value).toBeUndefined();
          expect(typeof result.error).toBe("string");
          expect(result.error!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
