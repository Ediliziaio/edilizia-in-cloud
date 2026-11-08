import { describe, expect, it } from "vitest";
import { coincideImporto } from "@/lib/finance/reconciliationAnalysis";

describe("ricerca per importo in riconciliazione", () => {
  it("riconosce i modi di scrivere lo stesso importo", () => {
    for (const q of ["1.234,50", "1234,50", "1234.50", "1234,5 €", "€ 1.234,50"]) expect(coincideImporto(q, 1234.5)).toBe(true);
  });
  it("non confonde importi diversi né testo", () => {
    expect(coincideImporto("1234,51", 1234.5)).toBe(false);
    expect(coincideImporto("rossi", 1234.5)).toBe(false);
    expect(coincideImporto("", 0)).toBe(false);
    expect(coincideImporto("-", 0)).toBe(false);
  });
});
