"use client";

import { useEffect } from "react";

const DEFAULT_BRAND = "#289a71";
const MIN_CONTRAST = 4.5;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function normalizeHex(value: string): string | null {
  const v = String(value || "").trim();
  if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return null;
  let h = v.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h.toLowerCase();
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hex: string): number {
  const lBut = luminance(parseHex(hex));
  const [l1, l2] = [1.0, lBut]; // white vs brand
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function mixWithBlack(hex: string, basePct: number): string {
  const rgb = parseHex(hex);
  const fade = basePct / 100;
  return toHex([rgb[0] * fade, rgb[1] * fade, rgb[2] * fade]);
}

function darkenForWhiteText(hex: string, startPct: number, minPct: number): string {
  for (let p = startPct; p >= minPct; p -= 5) {
    const candidate = mixWithBlack(hex, p);
    if (contrast(candidate) >= MIN_CONTRAST) return candidate;
  }
  return mixWithBlack(hex, minPct);
}

function updateThemeMeta(color: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

export function useBrandTheme(color?: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    const hex = normalizeHex(color || "");
    if (!hex) {
      root.style.removeProperty("--theme-primary");
      root.style.removeProperty("--color-brand-600");
      root.style.removeProperty("--color-brand-700");
      updateThemeMeta(DEFAULT_BRAND);
      return;
    }
    root.style.setProperty("--theme-primary", hex);
    updateThemeMeta(hex);
    if (contrast(mixWithBlack(hex, 80)) < MIN_CONTRAST) {
      root.style.setProperty("--color-brand-600", darkenForWhiteText(hex, 80, 35));
      root.style.setProperty("--color-brand-700", darkenForWhiteText(hex, 62, 20));
    } else {
      root.style.removeProperty("--color-brand-600");
      root.style.removeProperty("--color-brand-700");
    }
  }, [color]);
}