import { describe, expect, it } from "vitest";
import { celleDaRicalcolare, venditaDaCosto } from "@/lib/listino/celleGriglia";

describe("prezzo di vendita delle celle a ricarico", () => {
  it("toglie gli sconti fornitore e aggiunge il ricarico", () => {
    // 1000 − 50% − 3% = 485, +100% = 970 (stesso esempio del motore prezzi)
    expect(venditaDaCosto(1000, { sconto_fornitore_1: 50, sconto_fornitore_2: 3, markup_tipo: "percentuale", markup_valore: 100 })).toBe(970);
    expect(venditaDaCosto(500, { markup_tipo: "fisso_pz", markup_valore: 80 })).toBe(580);
  });

  it("trova le celle rimaste coi prezzi di prima dei parametri", () => {
    const parametri = { sconto_fornitore_1: 32, markup_tipo: "percentuale", markup_valore: 50 };
    const celle = [
      { id: "vecchia", prezzo_acquisto: 100, prezzo_vendita: 150 }, // calcolata senza lo sconto del 32%
      { id: "giusta", prezzo_acquisto: 100, prezzo_vendita: 102 }, // 100 − 32% = 68, +50% = 102
      { id: "fornitore", prezzo_acquisto: 100, prezzo_vendita: 150, supplier_product_line_id: "l1" },
      { id: "senza-costo", prezzo_acquisto: 0, prezzo_vendita: 90 },
    ];
    expect(celleDaRicalcolare(celle, parametri)).toEqual([{ id: "vecchia", attuale: 150, nuovo: 102 }]);
  });

  it("una cella giusta al centesimo non risulta da aggiornare", () => {
    // 0,92 + 10% = 1,012 → 1,01 salvato: in virgola mobile 1,01 − 1,00 supera 0,01.
    const parametri = { markup_tipo: "percentuale", markup_valore: 10 };
    expect(celleDaRicalcolare([{ id: "giusta", prezzo_acquisto: 0.92, prezzo_vendita: 1.01 }], parametri)).toEqual([]);
    expect(celleDaRicalcolare([{ id: "sbagliata", prezzo_acquisto: 0.92, prezzo_vendita: 1 }], parametri)).toHaveLength(1);
  });
});
