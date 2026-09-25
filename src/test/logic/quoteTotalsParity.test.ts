import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/quoteTotalsParity.json";
import { calcolaTotaliPreventivo, round2 } from "@/hooks/usePreventivoCosti";
import { assertSavedQuoteAmounts } from "@/lib/preventivi/quoteSaveValidation";

describe("parità calcoli UI / migrazione SQL", () => {
  it.each(fixtures)("$name", ({ items, discount, manual, manualRate, expected }) => {
    const totals = calcolaTotaliPreventivo(items.map((i) => ({
      discount_percent: 0, prezzo_acquisto: 0, is_optional: false, ...i,
    })), 0, discount, manual, manualRate);
    const actual = {
      subtotal: totals.subtotale,
      discount_amount: round2(totals.subtotale - totals.subtotale_netto),
      vat_amount: round2(totals.totale - totals.subtotale_netto),
      total: totals.totale,
    };
    expect(actual).toEqual(expected);
    expect(() => assertSavedQuoteAmounts(actual, expected)).not.toThrow();
    expect(round2(Object.values(totals.iva_breakdown).reduce((sum, n) => sum + n, 0))).toBe(actual.vat_amount);
  });

  it("blocca un solo centesimo di differenza e valori mancanti prima del PDF", () => {
    const expected = fixtures[0].expected;
    expect(() => assertSavedQuoteAmounts({ ...expected, total: 0.08 }, expected)).toThrow("server");
    expect(() => assertSavedQuoteAmounts({ ...expected, vat_amount: NaN }, expected)).toThrow();
    expect(() => assertSavedQuoteAmounts({ ...expected, total: null as unknown as number }, expected)).toThrow();
  });
});
