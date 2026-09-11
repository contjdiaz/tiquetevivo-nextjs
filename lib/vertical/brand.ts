/**
 * Pure brand-contrast helpers shared by every vertical (fruver, lavanderia, …).
 *
 * These functions are free of DOM and I/O so they can run on the server (SSR
 * of the public catalog / advertising hero) and in the browser, and be
 * verified with property-based tests without a rendering environment.
 *
 * They back the brand identity requirements: applying `business.color` to
 * primary elements while keeping accessible (AA) text contrast (R1.3, R1.4).
 *
 * `getVerticalTheme` emits both the generic `--brand-*` tokens and the
 * backwards-compatible aliases `--fruver-*`, so laundries (and any future
 * vertical) can consume the same storybook, while existing fruver surfaces
 * keep rendering without changes.
 */

import type { CSSProperties } from "react";

/** Readable text colors offered for a brand background. */
export const LIGHT_TEXT = "#ffffff" as const;
export const DARK_TEXT = "#0f172a" as const;

/** Fallback brand color used when a business has no valid color set. */
export const DEFAULT_BRAND_COLOR = "#16a34a" as const;

/**
 * Normalizes a hex color to lowercase `#rrggbb`.
 *
 * Accepts 3-digit (`#rgb`) and 6-digit (`#rrggbb`) forms, with or without a
 * leading `#`, and ignores surrounding whitespace. Returns `null` for any
 * value that is not a syntactically valid hex color (R1.3).
 *
 * Normalization is idempotent: `normalizeHex(normalizeHex(x)) === normalizeHex(x)`.
 *
 * @param input - Candidate color string (or nullish).
 * @returns The normalized `#rrggbb` string, or `null` when invalid.
 */
export function normalizeHex(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  const body = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

  if (!/^[0-9a-fA-F]+$/.test(body)) return null;

  let hex: string;
  if (body.length === 3) {
    // Expand shorthand #rgb -> #rrggbb.
    hex = body
      .split("")
      .map((ch) => ch + ch)
      .join("");
  } else if (body.length === 6) {
    hex = body;
  } else {
    return null;
  }

  return `#${hex.toLowerCase()}`;
}

/**
 * Converts a normalized `#rrggbb` string to its `[r, g, b]` channels (0-255).
 */
function hexToRgb(hex: string): [number, number, number] {
  const body = hex.slice(1);
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/**
 * Computes the relative luminance of an sRGB color per WCAG 2.x.
 *
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Computes the WCAG contrast ratio between two colors (both `#rrggbb`).
 *
 * @returns A ratio in the range `[1, 21]`.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks the readable text color (`#ffffff` or `#0f172a`) for a given brand
 * background, choosing whichever maximizes contrast (R1.3, R1.4).
 *
 * Invalid or nullish backgrounds fall back to the default brand color before
 * evaluation, so the function always returns one of the two supported text
 * colors. When both candidates tie, dark text is preferred for stability.
 *
 * @param bgHex - The background color (any form accepted by {@link normalizeHex}).
 * @returns `#ffffff` on dark backgrounds, `#0f172a` on light ones.
 */
export function readableTextColor(
  bgHex: string | null | undefined,
): typeof LIGHT_TEXT | typeof DARK_TEXT {
  const bg = normalizeHex(bgHex) ?? DEFAULT_BRAND_COLOR;
  const contrastWithLight = contrastRatio(bg, LIGHT_TEXT);
  const contrastWithDark = contrastRatio(bg, DARK_TEXT);
  return contrastWithLight > contrastWithDark ? LIGHT_TEXT : DARK_TEXT;
}

/**
 * CSS custom-property theme for a vertical's brand color.
 *
 * Emits the generic `--brand-*` tokens consumed by `components/vertical/*` and
 * the backwards-compatible `--fruver-*` aliases consumed by the existing fruver
 * storybook (`QuoteBuilder`, `AdvertisingSection`), so a single theme serves
 * every vertical.
 *
 * @param color - Validated business color; falls back to `defaultColor`.
 * @param defaultColor - Per-vertical fallback brand color.
 * @returns CSS properties ready to be applied to a theme root element.
 */
export function getVerticalTheme(
  color?: string | null,
  defaultColor: string = DEFAULT_BRAND_COLOR,
): CSSProperties {
  const primary = normalizeHex(color) ?? defaultColor;
  const onPrimary = readableTextColor(primary);
  const soft = `color-mix(in srgb, ${primary} 10%, white)`;
  const border = `color-mix(in srgb, ${primary} 30%, white)`;
  const strong = `color-mix(in srgb, ${primary} 70%, black)`;

  return {
    "--brand-primary": primary,
    "--brand-on-primary": onPrimary,
    "--brand-focus": primary,
    "--brand-primary-soft": soft,
    "--brand-primary-border": border,
    "--brand-primary-strong": strong,
    "--fruver-primary": primary,
    "--fruver-on-primary": onPrimary,
    "--fruver-focus": primary,
    "--fruver-primary-soft": soft,
    "--fruver-primary-border": border,
    "--fruver-primary-strong": strong,
  } as CSSProperties;
}