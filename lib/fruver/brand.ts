/**
 * Brand-contrast helpers for the "fruver" vertical.
 *
 * The generic engine lives in `@/lib/vertical/brand` (pure, DOM-free, shared by
 * every vertical). This module re-exports it unchanged so existing fruver
 * consumers keep their import paths and the fruver default brand color stays
 * the green `#16a34a`.
 */

export {
  LIGHT_TEXT,
  DARK_TEXT,
  normalizeHex,
  contrastRatio,
  readableTextColor,
  getVerticalTheme,
} from "@/lib/vertical/brand";

import { DEFAULT_BRAND_COLOR as FRUVER_DEFAULT } from "@/lib/vertical/brand";

/** Fallback brand color for a fruver business with no valid color set. */
export const DEFAULT_BRAND_COLOR: typeof FRUVER_DEFAULT = FRUVER_DEFAULT;