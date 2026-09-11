/**
 * Advertising renderer (Renderizador_Publicidad) shared by the catalog
 * verticals (fruver, lavanderia).
 *
 * `buildAdvertisingBlocks` is a pure composition function used inside
 * `public-ticket-data.ts` and the public catalog pages to enrich a business'
 * public surfaces with advertising blocks. It combines, using ONLY sanitized
 * public data:
 *   - active banner promotions (R4.1),
 *   - a seasonal/novelty section from products flagged `is_seasonal` (R4.2) —
 *     available only for product catalog verticals (fruver),
 *   - active combos (R4.3) — available only for product catalog verticals,
 *   - a social/WhatsApp-broadcast invitation from `promotions_config` (R4.4),
 *   - the active discount code with its next-purchase text (R4.5).
 *
 * Every block is derived exclusively from whitelisted projections so no
 * sensitive field is ever exposed (R4.6). When nothing is in effect, blocks
 * are returned empty/null so the ticket/catalog renders no empty advertising
 * blocks (R4.7).
 *
 * The function is free of I/O. Product-only sections (seasonal, combos) are
 * only composed for `catalogKind: "products"`; service-catalog verticals
 * (lavanderia) still get banners, discount codes and the social invitation.
 * For verticals outside the engine it returns fully empty blocks.
 */

import type {
  Product,
  Promotion,
  PublicProduct,
  PublicPromotion,
  PublicCombo,
  PublicDiscountCode
} from "./types";
import type { CatalogKind } from "@/lib/vertical/definitions";
import { CATALOG_VERTICALS } from "@/lib/vertical/definitions";
import { getActivePromotions } from "./promotions";
import { toPublicProduct, toPublicPromotion } from "./sanitize";

/**
 * Advertising blocks composed for a public ticket / catalog page.
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
  /** Vertical slug; blocks are only composed for catalog verticals. */
  vertical_slug: string;
  /**
   * How the vertical's catalog is sourced: product verticals additionally
   * compose the seasonal (R4.2) and combo (R4.3) sections.
   */
  catalogKind?: CatalogKind;
  /** Full catalog of the business (active and inactive). */
  products: Product[];
  /** All promotions of the business (active/inactive, any window). */
  promotions: Promotion[];
  /** The business' `promotions_config` JSONB (may be null/undefined). */
  promotionsConfig?: PromotionsConfig | null;
  /** Reference instant used to evaluate promotion validity windows. */
  now: Date;
}

/** Empty blocks used for non-catalog verticals or when nothing is in effect. */
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
 * Compose the advertising blocks for a public surface using only sanitized
 * public data.
 *
 * @param input - Vertical, catalog, promotions, config and reference instant.
 * @returns Advertising blocks with empty/null entries where nothing is in
 *   effect (R4.7).
 */
export function buildAdvertisingBlocks(
  input: BuildAdvertisingBlocksInput
): AdvertisingBlocks {
  const { vertical_slug, catalogKind = "products", products, promotions, promotionsConfig, now } = input;

  // Only compose advertising for catalog verticals registered in the engine.
  if (!CATALOG_VERTICALS.includes(vertical_slug)) {
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

  // Active discount code, sanitized. Only the first in-effect code is shown
  // as the next-purchase code (R4.5); `null` when none is in effect (R4.7).
  const discountCode: PublicDiscountCode | null =
    active
      .filter((promotion) => promotion.type === "discount_code")
      .map(toPublicPromotion)
      .filter((p): p is PublicDiscountCode => p.type === "discount_code")[0] ??
    null;

  // Social/broadcast invitation from config, or null when not configured
  // (R4.4, R4.7).
  const socialInvite = resolveSocialInvite(promotionsConfig);

  // Product-catalog only: combos (R4.3) and the seasonal/novelty section
  // (R4.2) need product ids/references that service verticals do not have.
  const combos: PublicCombo[] = [];
  const seasonal: PublicProduct[] = [];
  if (catalogKind === "products") {
    combos.push(
      ...(active
        .filter((promotion) => promotion.type === "combo")
        .map(toPublicPromotion)
        .filter((p): p is PublicCombo => p.type === "combo"))
    );

    seasonal.push(
      ...((products ?? [])
        .filter((product) => product.active && product.is_seasonal)
        .map(toPublicProduct))
    );
  }

  return {
    promotions: publicPromotions,
    seasonal,
    combos,
    socialInvite,
    discountCode
  };
}