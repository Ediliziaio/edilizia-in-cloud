import { describe, expect, it } from "vitest";
import { numeriCommessa } from "@/lib/orders/numeriCommessa";

const base = { ricavo: 120_689.89, costoPrevistoLavorazioni: 80_000, lavorazioniSenzaPrevisto: 0, provvigioni: 5_000, costiReali: 85_533, margineReale: 35_156.89 };

describe("numeri della commessa: previsto e reale", () => {
  it("il previsto è lavorazioni più provvigioni, il reale arriva com'è dal conto della commessa", () => {
    const n = numeriCommessa(base);
    expect(n.previsto).toMatchObject({ costo: 85_000, margine: 35_689.89, marginePct: 29.6 });
    expect(n.reale).toEqual({ costi: 85_533, margine: 35_156.89, marginePct: 29.1 });
    expect(n.scostamento).toBe(533);
  });

  it("senza costo previsto delle lavorazioni non c'è un previsto da confrontare (le sole provvigioni non bastano)", () => {
    const n = numeriCommessa({ ...base, costoPrevistoLavorazioni: 0 });
    expect(n.previsto).toBeNull();
    expect(n.scostamento).toBeNull();
    expect(n.aFinire).toBeNull();
  });

  it("dice quante lavorazioni non hanno un previsto", () => {
    expect(numeriCommessa({ ...base, lavorazioniSenzaPrevisto: 4 }).previsto?.lavorazioniSenzaPrevisto).toBe(4);
  });

  it("senza ricavo le percentuali non si inventano", () => {
    const n = numeriCommessa({ ...base, ricavo: 0 });
    expect(n.previsto?.marginePct).toBeNull();
    expect(n.reale.marginePct).toBeNull();
  });

  it("a metà lavori la stima a fine lavori conta il previsto, non il margine ottimista di oggi", () => {
    const n = numeriCommessa({ ...base, costiReali: 30_000, margineReale: 90_689.89 });
    expect(n.aFinire).toEqual({ costo: 85_000, margine: 35_689.89, marginePct: 29.6, residuo: 55_000, spesoPct: 35 });
  });

  it("oltre il previsto la stima a fine lavori segue i costi veri", () => {
    const n = numeriCommessa(base);
    expect(n.aFinire).toMatchObject({ costo: 85_533, margine: 35_156.89, residuo: 0, spesoPct: 101 });
  });
});
