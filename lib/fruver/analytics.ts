/**
 * Pure pilot-analytics aggregation module for the "fruver" vertical (R9).
 *
 * These helpers are free of I/O and DOM so they can run on the server (the
 * `fruver-analytics` endpoint) and be verified with property-based tests.
 * Every metric is computed strictly over the quotes that belong to the
 * requested `business_id` (R9.6, multi-tenant isolation) and, where a range
 * applies, within the inclusive `[from, to]` date window.
 *
 * Implemented metrics:
 *   - Weekly count of sent quotes           — R9.1 (Property 20)
 *   - Conversion percentage (empty-safe)    — R9.2, R9.5 (Property 21)
 *   - Distinct repurchase customers         — R9.3 (Property 22)
 *   - Average Total_Estimado of sent quotes — R9.4 (Property 23)
 */

import type { Quote } from "./types";

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Milliseconds in one week. */
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** A date range with inclusive bounds (ISO 8601 timestamps). */
export interface DateRange {
  /** Inclusive start of the range (ISO 8601). */
  from: string;
  /** Inclusive end of the range (ISO 8601). */
  to: string;
}

/** One bucket of the weekly aggregation of sent quotes (R9.1). */
export interface WeeklyQuoteCount {
  /**
   * ISO 8601 timestamp of the Monday 00:00:00 UTC that starts the week the
   * bucket represents.
   */
  week_start: string;
  /** Number of sent quotes whose `created_at` falls in this week. */
  count: number;
}

/**
 * Parses an ISO 8601 timestamp into epoch milliseconds, returning `NaN` for
 * non-string or unparseable values so callers can skip them.
 */
function toEpochMs(value: string | null | undefined): number {
  if (typeof value !== "string") return NaN;
  return Date.parse(value);
}

/**
 * Returns whether `quote` belongs to `businessId` and, when a `range` is
 * given, whether its `created_at` falls within the inclusive `[from, to]`
 * window. Quotes with a missing/unparseable `created_at` are excluded when a
 * range is provided.
 */
function inScope(quote: Quote, businessId: string, range?: DateRange): boolean {
  if (quote.business_id !== businessId) return false;
  if (!range) return true;

  const created = toEpochMs(quote.created_at);
  if (Number.isNaN(created)) return false;

  const from = toEpochMs(range.from);
  const to = toEpochMs(range.to);
  if (!Number.isNaN(from) && created < from) return false;
  if (!Number.isNaN(to) && created > to) return false;
  return true;
}

/**
 * Computes the start (Monday 00:00:00 UTC) of the ISO week that contains the
 * given epoch millisecond instant.
 */
function weekStartMs(epochMs: number): number {
  const date = new Date(epochMs);
  // Normalize to UTC midnight of the same calendar day.
  const dayStart = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  // getUTCDay: 0 = Sunday .. 6 = Saturday. Shift so Monday is day 0.
  const dayOfWeek = new Date(dayStart).getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return dayStart - daysSinceMonday * MS_PER_DAY;
}

/**
 * Aggregates the number of **sent** quotes per ISO week for a single business
 * within a date range (R9.1, Property 20).
 *
 * Every quote with `status === "enviada"` or `"convertida"` counts as sent
 * (a converted quote was necessarily sent first). Quotes are grouped by the
 * Monday-based week of their `created_at`. Only quotes matching `businessId`
 * and falling inside the inclusive range contribute (R9.6). The result is
 * sorted ascending by `week_start`; weeks with no quotes are omitted.
 *
 * @param quotes - Candidate quotes (may span many businesses).
 * @param businessId - The tenant whose quotes are counted.
 * @param range - Inclusive `[from, to]` date window.
 * @returns Weekly buckets sorted ascending by `week_start`.
 */
export function weeklySentQuotes(
  quotes: Quote[],
  businessId: string,
  range: DateRange,
): WeeklyQuoteCount[] {
  const counts = new Map<number, number>();

  for (const quote of quotes) {
    if (!inScope(quote, businessId, range)) continue;
    const created = toEpochMs(quote.created_at);
    const bucket = weekStartMs(created);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucket, count]) => ({
      week_start: new Date(bucket).toISOString(),
      count,
    }));
}

/**
 * Computes the conversion percentage as `(converted ÷ sent) × 100`, with an
 * anti-division-by-zero guard that returns exactly `0` when there are no sent
 * quotes (R9.2, R9.5, Property 21).
 *
 * @param sent - Number of sent quotes (denominator).
 * @param converted - Number of converted quotes (numerator).
 * @returns The conversion percentage, or `0` when `sent <= 0`.
 */
export function conversionPercentage(sent: number, converted: number): number {
  if (!Number.isFinite(sent) || sent <= 0) return 0;
  const safeConverted = Number.isFinite(converted) ? converted : 0;
  return (safeConverted / sent) * 100;
}

/**
 * Counts the distinct customers who repurchased using a Lista_Frecuente in the
 * range: customers with at least one quote where `from_frequent_list === true`
 * (R9.3, Property 22).
 *
 * Only quotes with a non-null `customer_id` are counted, since an anonymous
 * quote cannot be attributed to a returning customer. Isolation by
 * `businessId` and range is applied (R9.6).
 *
 * @param quotes - Candidate quotes (may span many businesses).
 * @param businessId - The tenant whose repurchases are counted.
 * @param range - Inclusive `[from, to]` date window.
 * @returns Number of distinct repurchasing customers.
 */
export function repurchaseCustomerCount(
  quotes: Quote[],
  businessId: string,
  range: DateRange,
): number {
  const customers = new Set<string>();

  for (const quote of quotes) {
    if (!inScope(quote, businessId, range)) continue;
    if (!quote.from_frequent_list) continue;
    if (quote.customer_id == null) continue;
    customers.add(quote.customer_id);
  }

  return customers.size;
}

/**
 * Computes the average `estimated_total` of the sent quotes for a business in
 * the range (R9.4, Property 23).
 *
 * Every quote in scope is a sent quote (`"enviada"` or `"convertida"`). Lines
 * with a non-finite `estimated_total` are ignored. Returns `0` when there are
 * no sent quotes, so the metric never produces `NaN`.
 *
 * @param quotes - Candidate quotes (may span many businesses).
 * @param businessId - The tenant whose average is computed.
 * @param range - Inclusive `[from, to]` date window.
 * @returns The mean `estimated_total`, or `0` when there are no sent quotes.
 */
export function averageEstimatedTotal(
  quotes: Quote[],
  businessId: string,
  range: DateRange,
): number {
  let sum = 0;
  let count = 0;

  for (const quote of quotes) {
    if (!inScope(quote, businessId, range)) continue;
    const total = quote.estimated_total;
    if (typeof total !== "number" || !Number.isFinite(total)) continue;
    sum += total;
    count += 1;
  }

  if (count === 0) return 0;
  return sum / count;
}

/** Aggregated pilot analytics for a business over a date range (R9). */
export interface PilotAnalytics {
  /** Sent quotes grouped by ISO week (R9.1). */
  weekly_sent: WeeklyQuoteCount[];
  /** Total sent quotes in the range. */
  total_sent: number;
  /** Total converted quotes in the range. */
  total_converted: number;
  /** Conversion percentage, empty-safe (R9.2, R9.5). */
  conversion_percentage: number;
  /** Distinct customers who repurchased via a Lista_Frecuente (R9.3). */
  repurchase_customers: number;
  /** Average Total_Estimado of sent quotes (R9.4). */
  average_estimated_total: number;
}

/**
 * Computes the full pilot-analytics report for a single business over a date
 * range, composing the individual metrics above. All figures are isolated by
 * `businessId` and constrained to the inclusive range (R9.1–R9.6).
 *
 * @param quotes - Candidate quotes (may span many businesses).
 * @param businessId - The tenant to report on.
 * @param range - Inclusive `[from, to]` date window.
 * @returns The aggregated {@link PilotAnalytics}.
 */
export function computePilotAnalytics(
  quotes: Quote[],
  businessId: string,
  range: DateRange,
): PilotAnalytics {
  const inRange = quotes.filter((quote) => inScope(quote, businessId, range));

  const totalSent = inRange.length;
  const totalConverted = inRange.filter(
    (quote) => quote.status === "convertida",
  ).length;

  return {
    weekly_sent: weeklySentQuotes(quotes, businessId, range),
    total_sent: totalSent,
    total_converted: totalConverted,
    conversion_percentage: conversionPercentage(totalSent, totalConverted),
    repurchase_customers: repurchaseCustomerCount(quotes, businessId, range),
    average_estimated_total: averageEstimatedTotal(quotes, businessId, range),
  };
}
