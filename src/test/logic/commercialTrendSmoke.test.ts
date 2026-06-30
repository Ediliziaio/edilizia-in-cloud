// Smoke-test: buildCommercialTrend non deve lanciare per i range/granularità reali
// usati dal pannello reportistica (regressione crash runtime "Errore caricamento").
import { describe, it, expect } from "vitest";
import {
  autoGranularity,
  buildCommercialTrend,
  buildPeriodComparison,
} from "@/lib/reporting/commercialTrend";

const EMPTY = { contacts: [], quotes: [], orders: [] };

describe("buildCommercialTrend smoke (no throw)", () => {
  const cases: Array<[string, Date, Date]> = [
    ["180g (default)", new Date("2026-01-01T00:00:00Z"), new Date("2026-06-29T12:00:00Z")],
    ["30g", new Date("2026-05-30T00:00:00Z"), new Date("2026-06-29T12:00:00Z")],
    ["1 anno", new Date("2025-06-29T00:00:00Z"), new Date("2026-06-29T12:00:00Z")],
    ["stesso giorno", new Date("2026-06-29T00:00:00Z"), new Date("2026-06-29T23:59:00Z")],
  ];
  for (const [label, from, to] of cases) {
    it(`non lancia: ${label} (auto)`, () => {
      const g = autoGranularity(from, to);
      expect(() => buildCommercialTrend(EMPTY, { from, to, granularity: g })).not.toThrow();
    });
    for (const g of ["day", "week", "month"] as const) {
      it(`non lancia: ${label} (${g})`, () => {
        expect(() => buildCommercialTrend(EMPTY, { from, to, granularity: g })).not.toThrow();
      });
    }
  }
});

describe("buildPeriodComparison smoke", () => {
  it("non lancia su set vuoti", () => {
    expect(() => buildPeriodComparison(EMPTY, EMPTY)).not.toThrow();
  });
});
