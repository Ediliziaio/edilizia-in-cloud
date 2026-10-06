/**
 * La rata «da X €/mese» della promo di finanziamento nel PDF (06/10/2026). Il calcolo si
 * controlla con una simulazione del piano a ritroso, mese per mese, che non usa la formula
 * dell'ammortamento: si paga la rata, si aggiunge l'interesse del mese e alla fine il debito
 * deve essere finito.
 */
import { describe, expect, it } from "vitest";
import { calcolaRataMensile, parseFinanziamentoPromo } from "@/lib/preventivi/finanziamentoLite";

/** Quanto resta da pagare dopo `rate` rate mensili di importo `rata`, con interesse TAN/12 sul residuo. */
function debitoResiduo(totale: number, rata: number, rate: number, tanPct: number): number {
  let debito = totale;
  for (let mese = 0; mese < rate; mese++) debito = debito * (1 + tanPct / 100 / 12) - rata;
  return debito;
}

describe("calcolaRataMensile", () => {
  it("a tasso zero è il totale diviso le rate: 1.200 € in 12 rate = 100 €", () => {
    expect(calcolaRataMensile(1200, 12, 0)).toBe(100);
    expect(calcolaRataMensile(1000, 3, 0)).toBeCloseTo(333.3333333, 6);
  });

  it("10.000 € in 12 rate al TAN 12% (1% al mese) = 888,49 € (valore di riferimento dei piani francesi)", () => {
    expect(calcolaRataMensile(10000, 12, 12)).toBeCloseTo(888.49, 2);
  });

  it.each([
    [24000, 120, 5.9], [8500, 24, 0], [15000, 60, 9.9], [1234.56, 12, 3.5], [50000, 84, 7.25], [300, 12, 0.5],
  ])("%s € in %s rate al TAN %s%%: pagando la rata ogni mese il debito è finito", (totale, rate, tan) => {
    const rata = calcolaRataMensile(totale, rate, tan);
    expect(Math.abs(debitoResiduo(totale, rata, rate, tan))).toBeLessThan(1e-6 * totale);
  });

  it("la rata cresce col TAN e cala con le rate", () => {
    expect(calcolaRataMensile(10000, 24, 6)).toBeGreaterThan(calcolaRataMensile(10000, 24, 0));
    expect(calcolaRataMensile(10000, 48, 6)).toBeLessThan(calcolaRataMensile(10000, 24, 6));
  });

  it("totale zero, negativo o non valido: nessuna rata; rate mancanti o non valide: una sola rata", () => {
    for (const totale of [0, -500, Number.NaN, null, undefined] as unknown[]) expect(calcolaRataMensile(totale as number, 12, 5)).toBe(0);
    expect(calcolaRataMensile(1000, 0, 0)).toBe(1000);
    expect(calcolaRataMensile(1000, Number.NaN, 0)).toBe(1000);
    expect(calcolaRataMensile(1200, 12.4, 0)).toBe(100); // 12,4 rate → 12
    expect(calcolaRataMensile(1000, 12, -5)).toBeCloseTo(1000 / 12, 9); // TAN negativo = tasso zero
  });
});

describe("parseFinanziamentoPromo: quello che arriva dal modello", () => {
  it("promo accesa: rate arrotondate e TAN così com'è", () => {
    expect(parseFinanziamentoPromo({ attivo: true, rate: 24, tan_pct: 5.9 })).toEqual({ attivo: true, rate: 24, tan_pct: 5.9 });
    expect(parseFinanziamentoPromo({ attivo: true, rate: 11.6, tan_pct: 0 })).toEqual({ attivo: true, rate: 12, tan_pct: 0 });
  });

  it("promo spenta, mancante o con rate non valide: niente rata", () => {
    for (const raw of [null, undefined, "x", 5, [], { attivo: false, rate: 24, tan_pct: 5 }, { attivo: "true", rate: 24, tan_pct: 5 },
      { attivo: true, rate: 0, tan_pct: 5 }, { attivo: true, rate: -3, tan_pct: 5 }, { attivo: true, rate: "abc", tan_pct: 5 }] as unknown[]) {
      expect(parseFinanziamentoPromo(raw)).toBeNull();
    }
  });
});
