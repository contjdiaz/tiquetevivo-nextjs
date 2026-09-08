/**
 * Pure quote calculation module for the "fruver" vertical.
 *
 * These helpers are intentionally free of DOM and I/O so they can run both in
 * the browser (immediate Total_Estimado feedback, R11.2) and on the server
 * (authoritative recalculation before persisting a quote, R6.1) and be
 * verified with property-based tests.
 */

import type { Product, QuoteLine } from "./types";

/**
 * Determines whether a quantity is valid: a finite number strictly greater
 * than zero. Rejects `NaN`, `Infinity`, non-numeric values and `qty <= 0`
 * (R5.4).
 */
function isValidQuantity(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isFinite(qty) && qty > 0;
}

/**
 * Computes the Total_Estimado as the sum of `day_price × qty` over the given
 * lines (R5.3).
 *
 * Only lines with a valid quantity (finite and `> 0`) and a finite numeric
 * `day_price` contribute to the total, so callers may pass raw selections
 * without pre-filtering. To operate strictly on sanitized input, run
 * {@link sanitizeQuantities} first and pass its `valid` lines.
 *
 * @param lines - Selected quote lines.
 * @returns The estimated total; `0` when there are no contributing lines.
 */
export function computeEstimatedTotal(lines: QuoteLine[]): number {
  return lines.reduce((total, line) => {
    const { day_price, qty } = line;
    if (!isValidQuantity(qty)) return total;
    if (typeof day_price !== "number" || !Number.isFinite(day_price)) {
      return total;
    }
    return total + day_price * qty;
  }, 0);
}

/**
 * Result of {@link sanitizeQuantities}: the accepted lines and the rejected
 * ones (those with a non-positive or non-numeric quantity).
 */
export interface SanitizeQuantitiesResult {
  /** Lines with a valid, positive numeric quantity. */
  valid: QuoteLine[];
  /** Lines excluded because their quantity is `<= 0` or non-numeric. */
  rejected: QuoteLine[];
}

/**
 * Splits quote lines into valid and rejected sets (R5.4).
 *
 * A line is rejected when its quantity is not a finite number greater than
 * zero (covers `qty <= 0`, `NaN`, `Infinity` and non-numeric values). Line
 * order within each set is preserved.
 *
 * @param lines - Raw quote lines to sanitize.
 * @returns The `valid` and `rejected` line partitions.
 */
export function sanitizeQuantities(lines: QuoteLine[]): SanitizeQuantitiesResult {
  const valid: QuoteLine[] = [];
  const rejected: QuoteLine[] = [];

  for (const line of lines) {
    if (isValidQuantity(line.qty)) {
      valid.push(line);
    } else {
      rejected.push(line);
    }
  }

  return { valid, rejected };
}

/**
 * A single entry of a saved Lista_Frecuente: only the product reference and
 * the desired quantity are persisted, so prices and product metadata must be
 * resolved against the current catalog at load time (R8.2, R8.3).
 */
export interface SavedFrequentLine {
  product_id: string;
  qty: number;
}

/**
 * Result of {@link reconcileFrequentList}: the rebuilt quote lines for the
 * products that are still available, plus the ids of saved products that are
 * no longer available.
 */
export interface ReconcileFrequentListResult {
  /**
   * Rebuilt lines for saved products that still exist and are active, using
   * the current catalog `day_price`, `name` and `unit` (R8.2, R8.3).
   */
  lines: QuoteLine[];
  /**
   * Ids of saved products that are inactive or no longer exist in the catalog
   * and were therefore omitted from {@link lines} (R8.4).
   */
  unavailable: string[];
}

/**
 * Reconciles a saved Lista_Frecuente against the current catalog (R8.2, R8.3,
 * R8.4).
 *
 * For each saved entry the function looks up the product in the current
 * catalog. It rebuilds a {@link QuoteLine} only when the product still exists
 * and is active, taking the authoritative `name`, `unit` and current
 * `day_price` from the catalog (never from stale saved data) while preserving
 * the saved `qty`. Saved products that are inactive or no longer present are
 * omitted from the rebuilt lines and reported by id in `unavailable`.
 *
 * Order is preserved: `lines` follow the order of the saved entries that are
 * still available, and `unavailable` follows the order of the saved entries
 * that are not.
 *
 * @param saved - The persisted frequent-list entries (`product_id` + `qty`).
 * @param catalog - The business' current products (active and inactive).
 * @returns The rebuilt `lines` and the `unavailable` product ids.
 */
export function reconcileFrequentList(
  saved: SavedFrequentLine[],
  catalog: Product[],
): ReconcileFrequentListResult {
  const activeById = new Map<string, Product>();
  for (const product of catalog) {
    if (product.active) {
      activeById.set(product.id, product);
    }
  }

  const lines: QuoteLine[] = [];
  const unavailable: string[] = [];

  for (const entry of saved) {
    const product = activeById.get(entry.product_id);
    if (product) {
      lines.push({
        product_id: product.id,
        name: product.name,
        unit: product.unit,
        day_price: product.day_price,
        qty: entry.qty,
      });
    } else {
      unavailable.push(entry.product_id);
    }
  }

  return { lines, unavailable };
}
