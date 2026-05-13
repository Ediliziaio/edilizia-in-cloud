/**
 * Test M20 · colorPalette utility.
 */
import { describe, it, expect } from "vitest";
import { generateBrandPalette, CURATED_PALETTES } from "@/lib/utils/colorPalette";

describe("generateBrandPalette", () => {
  it("returns 4 hex variations from a valid base", () => {
    const palette = generateBrandPalette("#2D7D5C");
    expect(palette).toHaveLength(4);
    palette.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/));
  });
  it("first entry is the base color (uppercased)", () => {
    const palette = generateBrandPalette("#2d7d5c");
    expect(palette[0]).toBe("#2D7D5C");
  });
  it("returns single-element array on invalid input", () => {
    expect(generateBrandPalette("not-a-color")).toEqual(["not-a-color"]);
  });
  it("darker variant is darker than base", () => {
    const [base, darker] = generateBrandPalette("#FF8800");
    // Confronto rough sui canali R+G+B sommati
    const sum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(sum(darker)).toBeLessThan(sum(base));
  });
  it("lighter variant is lighter than base", () => {
    const [base, , lighter] = generateBrandPalette("#FF8800");
    const sum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(sum(lighter)).toBeGreaterThan(sum(base));
  });
});

describe("CURATED_PALETTES", () => {
  it("contains at least 3 named palettes", () => {
    expect(CURATED_PALETTES.length).toBeGreaterThanOrEqual(3);
  });
  it("every palette has name, emoji, and 6 colors", () => {
    CURATED_PALETTES.forEach((p) => {
      expect(p.name).toBeTruthy();
      expect(p.emoji).toBeTruthy();
      expect(p.colors).toHaveLength(6);
      p.colors.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/i));
    });
  });
});
