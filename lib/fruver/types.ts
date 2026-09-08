/**
 * Fruver domain types and public (sanitized) interfaces.
 *
 * These types model the "fruver" vertical entities backed by the Supabase
 * tables `products`, `promotions` and `quotes`. The `Public*` interfaces
 * describe the whitelisted shapes exposed through public endpoints and the
 * ticket advertising renderer; they intentionally exclude sensitive fields
 * such as `business_id`, internal timestamps and `customer_id`.
 */

/** Sale unit accepted by the catalog (R2.2). */
export const SALE_UNITS = ["kg", "libra", "unidad"] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

/** Promotion discriminator type (R3). */
export type PromotionType = "banner" | "combo" | "discount_code";

/** Quote lifecycle status (R7.1, R7.2). */
export type QuoteStatus = "enviada" | "convertida";

/**
 * Product — catalog item (fruit or vegetable) owned by a business.
 * Mirrors the `products` table (R2).
 */
export interface Product {
  id: string;
  business_id: string;
  name: string;
  unit: SaleUnit;
  /** Price of the day; non-negative (R2.4). */
  day_price: number;
  photo_url: string | null;
  /** Season/novelty indicator (R2.8). */
  is_seasonal: boolean;
  /** Active products are shown in the public catalog (R2.1, R2.7). */
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Promotion — banner, combo or discount code with a validity window.
 * Mirrors the `promotions` table (R3, R4).
 */
export interface Promotion {
  id: string;
  business_id: string;
  type: PromotionType;
  /** Message for `banner` promotions (R3.1). */
  text: string | null;
  /** Code for `discount_code` promotions (R3.3). */
  code: string | null;
  /** Discount in range [0, 100] for combos and codes (R3.5). */
  discount_percent: number | null;
  /** Product ids grouped by a combo (R3.2). */
  product_ids: string[] | null;
  starts_at: string;
  ends_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * QuoteLine — a single selected product with its day price and quantity.
 * Persisted inside the `quotes.lines` / `frequent_lists.lines` JSONB (R6, R8).
 */
export interface QuoteLine {
  product_id: string;
  name: string;
  unit: SaleUnit;
  day_price: number;
  qty: number;
}

/**
 * Quote — a customer selection persisted for conversion tracking and pilot
 * analytics. Mirrors the `quotes` table (R6, R7, R9).
 */
export interface Quote {
  id: string;
  business_id: string;
  /** Optional customer link (unique by `business_id + phone`) (R6.5). */
  customer_id: string | null;
  /** Selected products with their day price and quantity (R6.1). */
  lines: QuoteLine[];
  /** Total_Estimado recalculated on the server (R6.1). */
  estimated_total: number;
  /** Lifecycle status: "enviada" on creation, "convertida" when purchased. */
  status: QuoteStatus;
  /** Whether the quote originated from a Lista_Frecuente (repurchase, R9.3). */
  from_frequent_list: boolean;
  /** Link to the resulting order when converted (R7.3). */
  order_id: string | null;
  /** Creation timestamp (ISO 8601); the "enviada" date (R7.1). */
  created_at: string;
  /** Conversion timestamp (ISO 8601); set when marked "convertida" (R7.2). */
  converted_at: string | null;
}

// ---------------------------------------------------------------------------
// Public (sanitized) shapes — whitelist projections (R4.6, R5.6, R10.3)
// ---------------------------------------------------------------------------

/** Public projection of a Product; excludes internal/tenant fields. */
export interface PublicProduct {
  id: string;
  name: string;
  unit: string;
  day_price: number;
  photo_url: string | null;
  is_seasonal: boolean;
}

/** Public projection of a banner promotion. */
export interface PublicPromotion {
  type: "banner";
  text: string;
  ends_at: string;
}

/** Public projection of a combo promotion. */
export interface PublicCombo {
  type: "combo";
  product_ids: string[];
  discount_percent: number;
  ends_at: string;
}

/** Public projection of a discount code promotion. */
export interface PublicDiscountCode {
  type: "discount_code";
  code: string;
  discount_percent: number;
  ends_at: string;
}
