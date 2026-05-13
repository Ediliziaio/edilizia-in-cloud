/**
 * Test M14 · contrast WCAG utility.
 * Copre i casi standard documentati nelle specifiche WCAG 2.1.
 */
import { describe, it, expect } from "vitest";
import { contrastRatio, wcagLevel, suggestBestTextColor, parseHex } from "@/lib/utils/contrast";

describe("parseHex", () => {
  it("parses #RRGGBB", () => {
    expect(parseHex("#FF0000")).toEqual([255, 0, 0]);
    expect(parseHex("#000000")).toEqual([0, 0, 0]);
    expect(parseHex("#FFFFFF")).toEqual([255, 255, 255]);
  });
  it("parses shorthand #RGB → #RRGGBB", () => {
    expect(parseHex("#F00")).toEqual([255, 0, 0]);
    expect(parseHex("#0F0")).toEqual([0, 255, 0]);
  });
  it("accepts hex without #", () => {
    expect(parseHex("FF0000")).toEqual([255, 0, 0]);
  });
  it("returns null on invalid input", () => {
    expect(parseHex("not-a-color")).toBeNull();
    expect(parseHex("#GGGGGG")).toBeNull();
    expect(parseHex("#1234")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("white vs black = 21:1 (maximum)", () => {
    const ratio = contrastRatio("#FFFFFF", "#000000");
    expect(ratio).toBeCloseTo(21, 0);
  });
  it("identical colors = 1:1 (minimum)", () => {
    expect(contrastRatio("#FF0000", "#FF0000")).toBeCloseTo(1, 1);
  });
  it("commutative (order doesn't matter)", () => {
    const ab = contrastRatio("#3B82F6", "#FFFFFF");
    const ba = contrastRatio("#FFFFFF", "#3B82F6");
    expect(ab).toBeCloseTo(ba, 5);
  });
  it("invalid input → fallback 1", () => {
    expect(contrastRatio("not-color", "#FFF")).toBe(1);
  });
});

describe("wcagLevel", () => {
  it("classifies AAA when ratio >= 7.0 (normal text)", () => {
    expect(wcagLevel(7.0)).toBe("AAA");
    expect(wcagLevel(15)).toBe("AAA");
  });
  it("classifies AA when 4.5 <= ratio < 7.0 (normal text)", () => {
    expect(wcagLevel(4.5)).toBe("AA");
    expect(wcagLevel(6.9)).toBe("AA");
  });
  it("classifies FAIL when ratio < 4.5 (normal text)", () => {
    expect(wcagLevel(4.4)).toBe("FAIL");
    expect(wcagLevel(1)).toBe("FAIL");
  });
  it("large text uses lower thresholds (3.0 / 4.5)", () => {
    expect(wcagLevel(3.0, true)).toBe("AA");
    expect(wcagLevel(4.5, true)).toBe("AAA");
    expect(wcagLevel(2.9, true)).toBe("FAIL");
  });
});

describe("suggestBestTextColor", () => {
  it("dark bg → suggests white", () => {
    expect(suggestBestTextColor("#000000")).toBe("#FFFFFF");
    expect(suggestBestTextColor("#0F2A2E")).toBe("#FFFFFF");
  });
  it("light bg → suggests black", () => {
    expect(suggestBestTextColor("#FFFFFF")).toBe("#000000");
    expect(suggestBestTextColor("#F5F5F4")).toBe("#000000");
  });
});
