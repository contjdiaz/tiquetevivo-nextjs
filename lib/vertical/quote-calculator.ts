/**
 * Pure quote calculation module shared by every vertical with a public catalog
 * (fruver quotes products, lavanderia quotes services).
 *
 * These helpers are intentionally free of DOM and I/O so they can run both in
 * the browser (immediate Total_Estimado feedback) and on the server
 * (authoritative recalculation before persisting a quote) and be verified with
 * property-based tests.
 */

/** Minimal line shape required to compute totals: a price and a quantity. */
export interface PricedLine {
  /** Unit price of the item (day price for products, service price for lavanderia). */
  day_price: number;
  /** Positive numeric quantity selected by the customer. */
  qty: number;
}

/**
 * Determines whether a quantity is valid: a finite number strictly greater
 * than zero. Rejects `NaN`, `Infinity`, non-numeric values and `qty <= 0`.
 */
function isValidQuantity(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isFinite(qty) && qty > 0;
}

/**
 * Computes the Total_Estimado as the sum of `day_price × qty` over the given
 * lines.
 *
 * Only lines with a valid quantity (finite and `> 0`) and a finite numeric
 * `day_price` contribute to the total, so callers may pass raw selections
 * without pre-filtering. To operate strictly on sanitized input, run
 * {@link sanitizeQuantities} first and pass its `valid` lines.
 *
 * @param lines - Selected quote lines (products or services).
 * @returns The estimated total; `0` when there are no contributing lines.
 */
export function computeEstimatedTotal(lines: PricedLine[]): number {
  return lines.reduce((total, line) => {
    const { day_price, qty } = line;
    if (!isValidQuantity(qty)) return total;
    if (typeof day_price !== "number" || !Number.isFinite(day_price)) {
      return total;
    }
    return total + line.day_price * qty;
  }, 0);
}

/** Result of {@link sanitizeQuantities}: accepted and rejected lines. */
export interface SanitizeQuantitiesResult<T> {
  /** Lines with a valid, positive numeric quantity. */
  valid: T[];
  /** Lines excluded because their quantity is `<= 0` or non-numeric. */
  rejected: T[];
}

/**
 * Splits quote lines into valid and rejected sets.
 *
 * A line is rejected when its quantity is not a finite number greater than
 * zero (covers `qty <= 0`, `NaN`, `Infinity` and non-numeric values). Line
 * order within each set is preserved.
 *
 * @param lines - Raw quote lines to sanitize.
 * @returns The `valid` and `rejected` line partitions.
 */
export function sanitizeQuantities<T extends PricedLine>(
  lines: T[],
): SanitizeQuantitiesResult<T> {
  const valid: T[] = [];
  const rejected: T[] = [];

  for (const line of lines) {
    if (isValidQuantity(line.qty)) {
      valid.push(line);
    } else {
      rejected.push(line);
    }
  }

  return { valid, rejected };
}

/** A single entry of a saved frequent list: item reference + quantity. */
export interface SavedFrequentLine {
  item_id: string;
  qty: number;
}

/** Catalog item shape big enough to reconcile a saved frequent list. */
export interface CatalogMember {
  id: string;
  name: string;
  unit: string;
  day_price: number;
  active: boolean;
}

/** Result of {@link reconcileFrequentList}: rebuilt lines and unavailable ids. */
export interface ReconcileFrequentListResult {
  /** Rebuilt lines for saved items that still exist and are active. */
  lines: (CatalogMember & { qty: number })[];
  /** Ids of saved items that are inactive or no longer exist. */
  unavailable: string[];
}

/**
 * Reconciles a saved frequent list against the current catalog.
 *
 * For each saved entry the function looks up the item in the current catalog.
 * It rebuilds a line only when the item still exists and is active, taking the
 * authoritative `name`, `unit` and current `day_price` from the catalog (never
 * from stale saved data) while preserving the saved `qty`. Saved items that
 * are inactive or no longer present are omitted and reported by id.
 *
 * Order is preserved: `lines` follow the order of the saved entries that are
 * still available, and `unavailable` follows the order of the saved entries
 * that are not.
 *
 * @param saved - The persisted frequent-list entries (`item_id` + `qty`).
 * @param catalog - The business' current catalog items (active and inactive).
 * @returns The rebuilt `lines` and the `unavailable` item ids.
 */
export function reconcileFrequentList<T extends CatalogMember>(
  saved: SavedFrequentLine[],
  catalog: T[],
): ReconcileFrequentListResult {
  const activeById = new Map<string, T>();
  for (const item of catalog) {
    if (item.active) {
      activeById.set(item.id, item);
    }
  }

  const lines: (T & { qty: number })[] = [];
  const unavailable: string[] = [];

  for (const entry of saved) {
    const item = activeById.get(entry.item_id);
    if (item) {
      lines.push({ ...item, qty: entry.qty });
    } else {
      unavailable.push(entry.item_id);
    }
  }

  return { lines, unavailable };
}