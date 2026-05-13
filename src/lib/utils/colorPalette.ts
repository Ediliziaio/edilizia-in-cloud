/**
 * colorPalette.ts — M20 · Generatore palette intelligente dal brand color.
 *
 * Dato un hex base (es. `colore_primario` aziendale), genera N variazioni
 * coerenti via manipolazione HSL: lighter/darker/saturated/desaturated.
 * Più 3 palette curate per use-case comuni della cover PDF.
 */

import { parseHex } from "./contrast";

/** Converte RGB 0-255 → HSL 0-360/0-100/0-100. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = ((bn - rn) / d + 2); break;
      case bn: h = ((rn - gn) / d + 4); break;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/** Converte HSL → hex string. */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh >= 0 && hh < 1) { r = c; g = x; b = 0; }
  else if (hh < 2)       { r = x; g = c; b = 0; }
  else if (hh < 3)       { r = 0; g = c; b = x; }
  else if (hh < 4)       { r = 0; g = x; b = c; }
  else if (hh < 5)       { r = x; g = 0; b = c; }
  else                   { r = c; g = 0; b = x; }
  const m = lN - c / 2;
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Genera 4 variazioni armoniose del colore base:
 * - base (originale)
 * - darker (-20 L)
 * - lighter (+20 L)
 * - desaturated (-40 S, +10 L) → versione "soft" da usare come bg
 */
export function generateBrandPalette(baseHex: string): string[] {
  const rgb = parseHex(baseHex);
  if (!rgb) return [baseHex];
  const [h, s, l] = rgbToHsl(...rgb);
  return [
    baseHex.toUpperCase(),
    hslToHex(h, s, Math.max(8, l - 20)),
    hslToHex(h, s, Math.min(92, l + 20)),
    hslToHex(h, Math.max(0, s - 40), Math.min(92, l + 10)),
  ];
}

/** Palette curate per use-case cover PDF — sfondi tested per leggibilità. */
export const CURATED_PALETTES: Array<{
  name: string;
  emoji: string;
  colors: string[];
}> = [
  {
    name: "Dark neutrals",
    emoji: "🌑",
    colors: ["#000000", "#0A0A0A", "#18181B", "#27272A", "#0F2A2E", "#1C1917"],
  },
  {
    name: "Serramentista classico",
    emoji: "🪟",
    colors: ["#2D7D5C", "#1E40AF", "#7C2D12", "#92400E", "#374151", "#0F172A"],
  },
  {
    name: "Pastelli moderni",
    emoji: "🎨",
    colors: ["#FEF3C7", "#FCE7F3", "#DBEAFE", "#D1FAE5", "#E0E7FF", "#FAFAF9"],
  },
];
