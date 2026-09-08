/**
 * Advertising renderer (Renderizador_Publicidad) for the "fruver" vertical.
 *
 * `buildAdvertisingBlocks` is a pure composition function used inside
 * `public-ticket-data.ts` to enrich a fruver business' public ticket with
 * advertising blocks. It combines, using ONLY sanitized public data:
 *   - active banner promotions (R4.1),
 *   - a seasonal/novelty section from products flagged `is_seasonal` (R4.2),
 *   - active combos (R4.3),
 *   - a social/WhatsApp-broadcast invitation from `promotions_config` (R4.4),
 *   - the active discount code with its next-purchase text (R4.5).
 *
 * Every block is derived exclusively from whitelisted projections
 * (`toPublicProduct` / `toPublicPromotion`) so no sensitive field is ever
 * exposed (R4.6). When nothing is in effect, blocks are returned empty/null so
 * the ticket renders no empty advertising blocks (R4.7).
 *
 * The function is free of I/O and only composes for the "fruver" vertical; for
 * any other vertical it returns fully empty blocks.
 */

import type {
  Product,
  Promotion,
  PublicProduct,
  PublicPromotion,
  PublicCombo,
  PublicDiscountCode
} from "./types";
import { getActivePromotions } from "./promotions";
import { toPublicProduct, toPublicPromotion } from "./sanitize";

/**
 * Advertising blocks composed for a fruver public ticket.
 *
 * Blocks that have no current content are empty arrays or `null`, so the
 * renderer never produces an empty advertising block to display (R4.7).
 */
export interface AdvertisingBlocks {
  /** In-effect banner promotions, sanitized (R4.1). */
  promotions: PublicPromotion[];
  /** Active products flagged as seasonal/novelty, sanitized (R4.2). */
  seasonal: PublicProduct[];
  /** In-effect combos, sanitized (R4.3). */
  combos: PublicCombo[];
  /** Social/broadcast invitation text from config, or `null` if none (R4.4). */
  socialInvite: string | null;
  /** In-effect discount code, sanitized, or `null` if none (R4.5). */
  discountCode: PublicDiscountCode | null;
}

/** Shape of the relevant fields read from `businesses.promotions_config`. */
interface PromotionsConfig {
  social_invite?: string | null;
  whatsapp_broadcast_invite?: string | null;
}

/** Input required to compose the advertising blocks. */
export interface BuildAdvertisingBlocksInput {
  /** Vertical slug; blocks are only composed for "fruver". */
  vertical_slug: string;
  /** Full catalog of the business (active and inactive). */
  products: Product[];
  /** All promotions of the business (active/inactive, any window). */
  promotions: Promotion[];
  /** The business' `promotions_config` JSONB (may be null/undefined). */
  promotionsConfig?: PromotionsConfig | null;
  /** Reference instant used to evaluate promotion validity windows. */
  now: Date;
}

/** Empty blocks used for non-fruver verticals or when nothing is in effect. */
function emptyBlocks(): AdvertisingBlocks {
  return {
    promotions: [],
    seasonal: [],
    combos: [],
    socialInvite: null,
    discountCode: null
  };
}

/**
 * Resolve the social invitation text from `promotions_config`, preferring the
 * explicit social invite and falling back to the WhatsApp broadcast invite.
 * Returns `null` when neither is a non-empty string (R4.4, R4.7).
 */
function resolveSocialInvite(config?: PromotionsConfig | null): string | null {
  if (!config) return null;

  const social =
    typeof config.social_invite === "string" ? config.social_invite.trim() : "";
  if (social) return social;

  const broadcast =
    typeof config.whatsapp_broadcast_invite === "string"
      ? config.whatsapp_broadcast_invite.trim()
      : "";
  if (broadcast) return broadcast;

  return null;
}

/**
 * Compose the advertising blocks for a fruver public ticket using only
 * sanitized public data.
 *
 * @param input - Vertical, catalog, promotions, config and reference instant.
 * @returns Advertising blocks with empty/null entries where nothing is in
 *   effect (R4.7).
 */
export function buildAdvertisingBlocks(
  input: BuildAdvertisingBlocksInput
): AdvertisingBlocks {
  const { vertical_slug, products, promotions, promotionsConfig, now } = input;

  // Only compose advertising for the fruver vertical (R4).
  if (vertical_slug !== "fruver") {
    return emptyBlocks();
  }

  // In-effect promotions only: active and within their validity window
  // (R4.1, R4.3, R4.5). Reuses the shared pure vigency module.
  const active = getActivePromotions(promotions ?? [], now);

  // Banner promotions, sanitized (R4.1).
  const publicPromotions: PublicPromotion[] = active
    .filter((promotion) => promotion.type === "banner")
    .map(toPublicPromotion)
    .filter((p): p is PublicPromotion => p.type === "banner");

  // Combos, sanitized (R4.3).
  const combos: PublicCombo[] = active
    .filter((promotion) => promotion.type === "combo")
    .map(toPublicPromotion)
    .filter((p): p is PublicCombo => p.type === "combo");

  // Active discount code, sanitized. Only the first in-effect code is shown
  // as the next-purchase code (R4.5); `null` when none is in effect (R4.7).
  const discountCode: PublicDiscountCode | null =
    active
      .filter((promotion) => promotion.type === "discount_code")
      .map(toPublicPromotion)
      .filter((p): p is PublicDiscountCode => p.type === "discount_code")[0] ??
    null;

  // Seasonal/novelty section: only active products flagged is_seasonal,
  // sanitized (R4.2).
  const seasonal: PublicProduct[] = (products ?? [])
    .filter((product) => product.active && product.is_seasonal)
    .map(toPublicProduct);

  // Social/broadcast invitation from config, or null when not configured
  // (R4.4, R4.7).
  const socialInvite = resolveSocialInvite(promotionsConfig);

  return {
    promotions: publicPromotions,
    seasonal,
    combos,
    socialInvite,
    discountCode
  };
}
