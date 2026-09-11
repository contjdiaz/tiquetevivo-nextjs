/**
 * Brand tokens for the "lavanderia" vertical.
 *
 * Re-uses the generalized engine (`@/lib/vertical/brand`). The vertical's
 * fallback brand color is the Maktub laundry blue `#1f4e8c`.
 */

import {
  getVerticalTheme,
  normalizeHex,
  contrastRatio,
  readableTextColor,
} from "@/lib/vertical/brand";

export { getVerticalTheme, normalizeHex, contrastRatio, readableTextColor };

/** Fallback brand color for a laundry business with no valid color set. */
export const DEFAULT_BRAND_COLOR: string = "#1f4e8c";