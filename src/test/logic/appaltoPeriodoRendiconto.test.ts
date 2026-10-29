import {describe, expect, it} from "vitest";
import {periodoDaRendicontare} from "@/lib/appalto/rendiconto";

describe("il periodo proposto per il rendiconto", () => {
  it("propone il mese appena chiuso, non quello in corso", () => {
    expect(periodoDaRendicontare(new Date(2026, 9, 28))).toEqual({dal: "2026-09-01", al: "2026-09-30"});
  });

  it("a gennaio torna a dicembre dell'anno PRIMA", () => {
    // È qui che si rompono le versioni scritte con setMonth(-1).
    expect(periodoDaRendicontare(new Date(2027, 0, 3))).toEqual({dal: "2026-12-01", al: "2026-12-31"});
  });

  it("prende l'ultimo giorno giusto dei mesi corti", () => {
    expect(periodoDaRendicontare(new Date(2026, 2, 15))).toEqual({dal: "2026-02-01", al: "2026-02-28"});
  });

  it("e il 29 febbraio degli anni bisestili", () => {
    expect(periodoDaRendicontare(new Date(2028, 2, 10))).toEqual({dal: "2028-02-01", al: "2028-02-29"});
  });

  it("non sbaglia nei mesi da 31 giorni", () => {
    expect(periodoDaRendicontare(new Date(2026, 8, 1))).toEqual({dal: "2026-08-01", al: "2026-08-31"});
  });
});
