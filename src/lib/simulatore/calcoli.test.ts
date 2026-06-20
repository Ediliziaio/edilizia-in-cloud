import { describe, it, expect } from "vitest";
import { calcolaVoce, calcolaTotali, calcolaIva } from "./calcoli";
import type { VoceSim } from "./tipi";

const voce = (p: Partial<VoceSim>): VoceSim => ({
  id: "1", fase_id: null, descrizione: "x", fonte: "libera", riferimento_id: null,
  codice: null, quantita: 1, unita: "pz", costo_unitario: 0, ricarico_pct: 0,
  prezzo_unitario: 0, vat_rate: 10, bene_significativo: false,
  valore_posa_associata: null, is_manodopera: false, ordine: 0, ...p,
});

describe("calcolaVoce", () => {
  it("calcola imponibili e margine", () => {
    const r = calcolaVoce(voce({ quantita: 10, costo_unitario: 12, prezzo_unitario: 18 }));
    expect(r.imponibile_costo).toBe(120);
    expect(r.imponibile_ricavo).toBe(180);
    expect(r.margine).toBe(60);
  });
});

describe("calcolaTotali", () => {
  it("somma costi/ricavi e calcola margine %", () => {
    const r = calcolaTotali([
      voce({ quantita: 1, costo_unitario: 100, prezzo_unitario: 150 }),
      voce({ quantita: 2, costo_unitario: 25, prezzo_unitario: 50 }),
    ]);
    expect(r.costo_totale).toBe(150);
    expect(r.ricavo_imponibile).toBe(250);
    expect(r.margine_valore).toBe(100);
    expect(r.margine_pct).toBe(40);
  });
  it("margine_pct=0 con ricavo 0 (no NaN)", () => {
    expect(calcolaTotali([]).margine_pct).toBe(0);
  });
});

describe("calcolaIva", () => {
  it("singola: tutto a una aliquota", () => {
    const r = calcolaIva([voce({ quantita: 1, prezzo_unitario: 1000, vat_rate: 22 })], {
      iva_mode: "singola",
      iva_rate_singola: 10,
      iva_confronto: [],
      finanziamento: null,
    });
    expect(r.iva_totale).toBe(100);
    expect(r.riepilogo_iva).toEqual([{ aliquota: 10, imponibile: 1000, imposta: 100 }]);
  });
  it("mista: somma per aliquota di riga", () => {
    const r = calcolaIva(
      [
        voce({ quantita: 1, prezzo_unitario: 1000, vat_rate: 10 }),
        voce({ quantita: 1, prezzo_unitario: 500, vat_rate: 22 }),
      ],
      { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null },
    );
    expect(r.iva_totale).toBe(210);
  });
  it("mista: bene significativo split 10/22", () => {
    // bene 1000, posa 300 → 10% su 300+300=600, 22% su 700
    const r = calcolaIva(
      [
        voce({
          quantita: 1,
          prezzo_unitario: 1000,
          vat_rate: 10,
          bene_significativo: true,
          valore_posa_associata: 300,
        }),
      ],
      { iva_mode: "mista", iva_rate_singola: 10, iva_confronto: [], finanziamento: null },
    );
    const r10 = r.riepilogo_iva.find((x) => x.aliquota === 10)!;
    const r22 = r.riepilogo_iva.find((x) => x.aliquota === 22)!;
    expect(r10.imponibile).toBe(600);
    expect(r10.imposta).toBe(60);
    expect(r22.imponibile).toBe(700);
    expect(r22.imposta).toBe(154);
  });
});
