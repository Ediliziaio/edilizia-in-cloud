import { describe, expect, it } from "vitest";
import {
  buildQuoteTemplatesTabParams,
  normalizeQuoteTemplatesParams,
  resolveQuoteTemplatesTopTab,
} from "@/lib/settingsQuoteTemplatesRoute";

describe("settings quote templates route params", () => {
  it("forces the sales-modules tab when a valid sales module is in the URL", () => {
    expect(resolveQuoteTemplatesTopTab("documenti", "serramenti")).toBe("moduli-vendita");
    expect(resolveQuoteTemplatesTopTab("documenti", "fotovoltaico")).toBe("moduli-vendita");
  });

  it("preserves deep links for every sales vertical", () => {
    const modules = [
      "serramenti",
      "fotovoltaico",
      "ristrutturazione",
      "bagni",
      "tetti",
      "climatizzazione",
      "elettrico",
      "termoidraulico",
      "pavimenti",
      "piscine",
    ];

    for (const modulo of modules) {
      const params = new URLSearchParams(`tab=moduli-vendita&modulo=${modulo}&section=page_cover`);
      expect(normalizeQuoteTemplatesParams(params)).toBeNull();
      expect(resolveQuoteTemplatesTopTab("documenti", modulo)).toBe("moduli-vendita");
    }
  });

  it("normalizes a stale document tab URL that still has a sales module", () => {
    const params = new URLSearchParams("tab=documenti&modulo=serramenti&section=page_chi_siamo");
    const normalized = normalizeQuoteTemplatesParams(params);

    expect(normalized?.toString()).toBe("tab=moduli-vendita&modulo=serramenti&section=page_chi_siamo");
  });

  it("cleans sales-module params when switching back to document templates", () => {
    const params = new URLSearchParams("tab=moduli-vendita&modulo=serramenti&section=page_chi_siamo");
    const next = buildQuoteTemplatesTabParams(params, "documenti");

    expect(next.get("tab")).toBe("documenti");
    expect(next.has("modulo")).toBe(false);
    expect(next.has("section")).toBe(false);
  });
});
