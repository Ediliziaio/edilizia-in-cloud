/**
 * contrast.ts — Utility WCAG per calcolo contrast ratio testo/sfondo.
 *
 * Standard usato: WCAG 2.1 §1.4.3 (Contrast (Minimum)) e §1.4.6 (Enhanced).
 *   - AAA (Enhanced): ratio ≥ 7.0:1 (4.5:1 per large text)
 *   - AA  (Minimum):  ratio ≥ 4.5:1 (3.0:1 per large text)
 *   - FAIL:           ratio < 4.5:1
 *
 * Formula relative luminance: WCAG sRGB.
 * Per uso pratico nei preview/editor (cover PDF, badge colore, ecc).
 */

/** Converte hex string (#RRGGBB o #RGB) in [r, g, b] 0-255. Robust al formato. */
export function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  // Espande forma shorthand #RGB → #RRGGBB
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance secondo WCAG: L = 0.2126·R + 0.7152·G + 0.0722·B
 *  con R/G/B linearizzati. Input 0-255, output 0..1. */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Contrast ratio WCAG tra due colori hex. Ritorna numero ∈ [1, 21].
 *  Robust: se uno dei due hex è invalido, fallback a 1 (no contrast). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return 1;
  const lA = relativeLuminance(...a);
  const lB = relativeLuminance(...b);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Classificazione WCAG. `largeText` = font ≥ 18pt o 14pt bold (soglia più bassa). */
export type WcagLevel = "AAA" | "AA" | "FAIL";

export function wcagLevel(ratio: number, largeText: boolean = false): WcagLevel {
  if (largeText) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3.0) return "AA";
    return "FAIL";
  }
  if (ratio >= 7.0) return "AAA";
  if (ratio >= 4.5) return "AA";
  return "FAIL";
}

/** Suggerisce il colore testo (#000 o #FFF) con miglior contrasto su un dato bg.
 *  Utile per auto-fix nell'editor cover quando il livello è FAIL. */
export function suggestBestTextColor(bgHex: string): "#000000" | "#FFFFFF" {
  const cBlack = contrastRatio(bgHex, "#000000");
  const cWhite = contrastRatio(bgHex, "#FFFFFF");
  return cWhite >= cBlack ? "#FFFFFF" : "#000000";
}
