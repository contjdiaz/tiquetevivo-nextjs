/**
 * Validators for the "fruver" vertical.
 *
 * These validators back the Gestor_Catalogo (products) and, in later tasks,
 * the Gestor_Promociones (promotions). They reuse the shared platform
 * validators from `lib/api/_validators.ts` where applicable (e.g.
 * `validateAmount` for the day price) and add fruver-specific rules such as
 * the allowed sale units.
 *
 * Every validator returns a descriptive `error` message and the offending
 * `field` on failure, so callers can surface actionable messages to the Dueño
 * (R2.3, R2.4).
 */

import { validateAmount } from "@/lib/api/_validators";
import { SALE_UNITS, type SaleUnit } from "@/lib/fruver/types";

/** Result shape shared by fruver validators, including the offending field. */
export interface FruverValidationResult<T = unknown> {
  valid: boolean;
  /** Normalized value when `valid` is true. */
  value?: T;
  /** Descriptive error message when `valid` is false. */
  error?: string;
  /** The field the result refers to (useful for form-level error mapping). */
  field: string;
}

/**
 * Validate a product sale unit (Unidad_Venta).
 *
 * Accepts a value if and only if it is exactly one of `kg`, `libra` or
 * `unidad`; any other value is rejected with a descriptive message (R2.2, R2.3).
 */
export function validateUnit(unit: unknown): FruverValidationResult<SaleUnit> {
  const field = "unit";

  if (unit == null || typeof unit !== "string") {
    return {
      valid: false,
      field,
      error: `La unidad de venta es obligatoria y debe ser una de: ${SALE_UNITS.join(", ")}`,
    };
  }

  if (!(SALE_UNITS as readonly string[]).includes(unit)) {
    return {
      valid: false,
      field,
      error: `La unidad de venta debe ser una de: ${SALE_UNITS.join(", ")}. Recibido: "${unit}"`,
    };
  }

  return { valid: true, field, value: unit as SaleUnit };
}

/**
 * Validate a product day price (precio del día).
 *
 * Reuses the shared `validateAmount` helper so the rules stay consistent with
 * the rest of the platform (finite number, non-negative, within bounds) and
 * wraps the result with the offending `field` (R2.4).
 */
export function validateDayPrice(dayPrice: unknown): FruverValidationResult<number> {
  const field = "day_price";

  // Only numbers and numeric strings are acceptable. Reject objects, arrays,
  // symbols, etc. up front so a malformed `toString`/`valueOf` can never throw
  // during the numeric coercion performed by `validateAmount`.
  if (dayPrice != null && typeof dayPrice !== "number" && typeof dayPrice !== "string") {
    return {
      valid: false,
      field,
      error: "El precio del día debe ser un número no negativo",
    };
  }

  const result = validateAmount(dayPrice, "El precio del día");

  if (!result.valid) {
    return { valid: false, field, error: result.error };
  }

  return { valid: true, field, value: result.value };
}
/**
 * Validate a Promocion validity window (ventana de validez).
 *
 * Accepts a pair of ISO date/datetime strings if and only if both parse to
 * valid dates and the end date is greater than or equal to the start date
 * (`ends_at >= starts_at`). Otherwise the operation is rejected with a
 * descriptive message so the Dueño can correct the window (R3.4).
 */
export function validateWindow(
  startsAt: unknown,
  endsAt: unknown
): FruverValidationResult<{ starts_at: string; ends_at: string }> {
  const field = "ends_at";

  if (startsAt == null || typeof startsAt !== "string" || startsAt.trim() === "") {
    return {
      valid: false,
      field: "starts_at",
      error: "La fecha de inicio de la promoción es obligatoria y debe ser una fecha válida",
    };
  }

  if (endsAt == null || typeof endsAt !== "string" || endsAt.trim() === "") {
    return {
      valid: false,
      field,
      error: "La fecha de fin de la promoción es obligatoria y debe ser una fecha válida",
    };
  }

  const startTime = new Date(startsAt).getTime();
  if (Number.isNaN(startTime)) {
    return {
      valid: false,
      field: "starts_at",
      error: `La fecha de inicio de la promoción no es una fecha válida. Recibido: "${startsAt}"`,
    };
  }

  const endTime = new Date(endsAt).getTime();
  if (Number.isNaN(endTime)) {
    return {
      valid: false,
      field,
      error: `La fecha de fin de la promoción no es una fecha válida. Recibido: "${endsAt}"`,
    };
  }

  if (endTime < startTime) {
    return {
      valid: false,
      field,
      error: "La fecha de fin de la promoción no puede ser anterior a la fecha de inicio",
    };
  }

  return { valid: true, field, value: { starts_at: startsAt, ends_at: endsAt } };
}

/**
 * Validate a discount percentage for a Combo or Codigo_Descuento.
 *
 * Accepts a value if and only if it is a finite number within the closed
 * range [0, 100]; any value outside this range, or a non-numeric value, is
 * rejected with a descriptive message (R3.5).
 */
export function validateDiscountPercent(
  discountPercent: unknown
): FruverValidationResult<number> {
  const field = "discount_percent";

  if (discountPercent == null) {
    return {
      valid: false,
      field,
      error: "El porcentaje de descuento es obligatorio y debe estar entre 0 y 100",
    };
  }

  // Only numbers and numeric strings are acceptable inputs. Reject objects,
  // arrays, symbols, etc. up front so a malformed `toString`/`valueOf` can
  // never throw during coercion.
  if (typeof discountPercent !== "number" && typeof discountPercent !== "string") {
    return {
      valid: false,
      field,
      error: "El porcentaje de descuento debe ser un número entre 0 y 100",
    };
  }

  const num =
    typeof discountPercent === "number" ? discountPercent : Number(discountPercent);

  if (!Number.isFinite(num)) {
    return {
      valid: false,
      field,
      error: `El porcentaje de descuento debe ser un número finito. Recibido: "${String(discountPercent)}"`,
    };
  }

  if (num < 0 || num > 100) {
    return {
      valid: false,
      field,
      error: `El porcentaje de descuento debe estar entre 0 y 100. Recibido: ${num}`,
    };
  }

  return { valid: true, field, value: num };
}
