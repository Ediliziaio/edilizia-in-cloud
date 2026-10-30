import { describe, expect, it } from "vitest";
import { leggiImporto, quotaIvata, quotaProposta, verificaQuote } from "@/lib/fatturazione/quoteOrdini";

describe("fattura divisa tra più ordini", () => {
  it("un ordine solo: tutta la fattura, nessuna quota da controllare", () => {
    expect(verificaQuote(3000, [{ purchase_order_id: "a", importo: 0 }])).toEqual({ assegnato: 3000, resto: 0, errore: null });
  });

  it("nessun ordine scelto non si collega", () => {
    expect(verificaQuote(3000, []).errore).toMatch(/almeno un ordine/);
  });

  it("due ordini: le quote sommate, il resto è un costo generale", () => {
    const e = verificaQuote(3000, [
      { purchase_order_id: "a", importo: 1000 },
      { purchase_order_id: "b", importo: 1500.5 },
    ]);
    expect(e).toEqual({ assegnato: 2500.5, resto: 499.5, errore: null });
  });

  it("le quote non superano l'imponibile (un centesimo di tolleranza)", () => {
    expect(verificaQuote(3000, [
      { purchase_order_id: "a", importo: 1000 },
      { purchase_order_id: "b", importo: 2000.01 },
    ]).errore).toBeNull();
    expect(verificaQuote(3000, [
      { purchase_order_id: "a", importo: 1000 },
      { purchase_order_id: "b", importo: 2001 },
    ]).errore).toMatch(/superano/);
  });

  it("ogni ordine scelto ha una quota maggiore di zero", () => {
    expect(verificaQuote(3000, [
      { purchase_order_id: "a", importo: 1000 },
      { purchase_order_id: "b", importo: 0 },
    ]).errore).toMatch(/maggiore di zero/);
    expect(verificaQuote(3000, [
      { purchase_order_id: "a", importo: 1000 },
      { purchase_order_id: "b", importo: NaN },
    ]).errore).toMatch(/maggiore di zero/);
  });

  it("senza imponibile non si divide", () => {
    expect(verificaQuote(null, [
      { purchase_order_id: "a", importo: 1 },
      { purchase_order_id: "b", importo: 2 },
    ]).errore).toMatch(/imponibile/);
  });

  it("la quota proposta è l'ordine, ma non oltre quanto resta della fattura", () => {
    expect(quotaProposta(1000, 3000, 0)).toBe(1000);
    expect(quotaProposta(2500, 3000, 1000)).toBe(2000);
    expect(quotaProposta(null, 3000, 1000)).toBe(2000);
    expect(quotaProposta(800, null, 0)).toBe(800);
  });

  it("la quota IVA compresa, per confrontarla col totale ordine", () => {
    expect(quotaIvata(1000, 3000, 3660)).toBe(1220);
    expect(quotaIvata(1000, null, 3660)).toBe(1000);
  });

  it("legge gli importi scritti all'italiana e col punto", () => {
    expect(leggiImporto("1.234,56")).toBe(1234.56);
    expect(leggiImporto("1234,5")).toBe(1234.5);
    expect(leggiImporto("12.5")).toBe(12.5);
    expect(leggiImporto(" 900 € ")).toBe(900);
    expect(leggiImporto("")).toBeNaN();
    expect(leggiImporto("abc")).toBeNaN();
  });
});
