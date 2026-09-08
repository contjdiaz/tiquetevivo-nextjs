/**
 * Whitelist sanitization for public fruver data.
 *
 * Public endpoints (public-catalog, submit-quote responses) and the ticket
 * advertising renderer MUST expose only public-safe fields. Following the
 * pattern of `stripSensitiveOrderFields` in `lib/api/public-ticket-data.ts`,
 * these projections guarantee that internal/tenant fields are never leaked:
 *   - `business_id`
 *   - internal timestamps (`created_at`, `updated_at`)
 *   - `customer_id`
 *   - `active` and any other field not listed in the `Public*` interfaces
 *
 * Unlike a blacklist (delete known-sensitive keys), these functions build the
 * output from an explicit allow-list of fields, so new columns added to the
 * underlying tables can never accidentally reach the browser.
 */
import type {
  Product,
  Promotion,
  PublicProduct,
  PublicPromotion,
  PublicCombo,
  PublicDiscountCode
} from "./types";

/** Any public promotion projection (banner, combo or discount code). */
export type PublicPromotionAny = PublicPromotion | PublicCombo | PublicDiscountCode;

/**
 * Project a Product onto its public whitelist shape.
 *
 * Only `id`, `name`, `unit`, `day_price`, `photo_url` and `is_seasonal` are
 * exposed. `business_id`, `active`, `created_at` and `updated_at` are dropped.
 */
export function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    name: product.name,
    unit: product.unit,
    day_price: product.day_price,
    photo_url: product.photo_url ?? null,
    is_seasonal: Boolean(product.is_seasonal)
  };
}

/** Project a list of Products onto their public whitelist shape. */
export function toPublicProducts(products: Product[]): PublicProduct[] {
  return products.map(toPublicProduct);
}

/**
 * Project a Promotion onto its public whitelist shape, discriminated by `type`.
 *
 * `business_id`, `active`, `starts_at`, `created_at` and `updated_at` are never
 * exposed. Only the fields relevant to each promotion type are included.
 */
export function toPublicPromotion(promotion: Promotion): PublicPromotionAny {
  switch (promotion.type) {
    case "combo":
      return {
        type: "combo",
        product_ids: promotion.product_ids ?? [],
        discount_percent: promotion.discount_percent ?? 0,
        ends_at: promotion.ends_at
      };
    case "discount_code":
      return {
        type: "discount_code",
        code: promotion.code ?? "",
        discount_percent: promotion.discount_percent ?? 0,
        ends_at: promotion.ends_at
      };
    case "banner":
    default:
      return {
        type: "banner",
        text: promotion.text ?? "",
        ends_at: promotion.ends_at
      };
  }
}

/** Project a list of Promotions onto their public whitelist shapes. */
export function toPublicPromotions(promotions: Promotion[]): PublicPromotionAny[] {
  return promotions.map(toPublicPromotion);
}
