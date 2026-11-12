import { describe, expect, it } from "vitest";
import {
  riconciliaDdtDiretto,
  type DocumentoConsegna,
  type FatturaFornitura,
  type RigaConsegnata,
} from "@/lib/orders/generali/controlloForniture";

export const bolla: DocumentoConsegna = {
  id: "ddt",
  purchase_order_id: null,
  order_id: "generale",
  numero_ddt: "DIR-1",
  stato: "ricevuto",
};
export const riga: RigaConsegnata = {
  id: "r",
  ddt_ricezione_id: "ddt",
  purchase_order_item_id: null,
  quantita: 5,
  prezzo_unitario: 10,
  importo: 50,
  descrizione: "Materiali diretti",
  unita_misura: "pz",
};
export const fattura: FatturaFornitura = {
  id: "f",
  purchase_order_id: null,
  company_cost_id: "c",
  numero_fattura: "F-DIR",
  righe: [{ quantita: 5, prezzo_unitario: 10, imponibile: 50 }],
  tipo_documento: "TD01",
  imponibile_totale: 50,
  stato: "contabilizzata",
  updated_at: null,
};
export const legame = { id: "l", fattura_ricevuta_id: "f", ddt_ricezione_id: "ddt" };

describe("DDT → fattura senza ordine", () => {
  it("riconosce il collegamento documentale senza pretendere una riga d'ordine", () => {
    expect(riconciliaDdtDiretto(bolla, [riga], [fattura], [legame])).toMatchObject({
      valore: 50,
      fatturato: 50,
      avvisi: [],
    });
  });
  it("deduplica righe e fatture raggiunte da più collegamenti", () => {
    const c = riconciliaDdtDiretto(
      bolla,
      [riga, riga],
      [fattura, fattura],
      [legame, { ...legame, id: "l2" }],
    );
    expect(c.valore).toBe(50);
    expect(c.fatturato).toBe(50);
    expect(c.fatture).toHaveLength(1);
  });
  it("non attribuisce tutto il valore di una fattura cumulativa a ciascun DDT, anche se l'altro è fuori dall'operazione", () => {
    const c = riconciliaDdtDiretto(
      bolla,
      [riga],
      [{ ...fattura, imponibile_totale: 100 }],
      [legame, { ...legame, id: "l2", ddt_ricezione_id: "altro-cantiere" }],
    );
    expect(c.fatturaCondivisa).toBe(true);
    expect(c.fatturato).toBeNull();
    expect(c.avvisi).toEqual([]);
  });
  it("una bolla in attesa della fattura resta nel percorso senza ordine", () => {
    const c = riconciliaDdtDiretto(bolla, [riga], [], []);
    expect(c.valore).toBe(50);
    expect(c.fatture).toEqual([]);
    expect(c.avvisi).toEqual(["In attesa della fattura o del suo collegamento"]);
  });
  it("mantiene sconosciuti gli importi mancanti della bolla e della fattura", () => {
    const c = riconciliaDdtDiretto(
      bolla,
      [{ ...riga, importo: null, prezzo_unitario: null }],
      [{ ...fattura, imponibile_totale: null }],
      [legame],
    );
    expect(c.valore).toBeNull();
    expect(c.fatturato).toBeNull();
    expect(c.avvisi).toHaveLength(2);
  });
  it("segnala gli scostamenti senza trasformarli in nuovi costi", () => {
    const c = riconciliaDdtDiretto(bolla, [riga], [{ ...fattura, imponibile_totale: 60 }], [legame]);
    expect(c.valore).toBe(50);
    expect(c.fatturato).toBe(60);
    expect(c.avvisi[0]).toContain("Importi della bolla e delle fatture diversi");
  });
  it("la nota di credito riduce il fatturato collegato", () => {
    const nc = { ...fattura, id: "nc", tipo_documento: "TD04", imponibile_totale: -10 };
    const c = riconciliaDdtDiretto(
      bolla,
      [riga],
      [{ ...fattura, imponibile_totale: 60 }, nc],
      [legame, { ...legame, id: "ln", fattura_ricevuta_id: "nc" }],
    );
    expect(c.fatturato).toBe(50);
    expect(c.avvisi).toEqual([]);
  });
  it("esclude fatture rifiutate e richiede la contabilizzazione di quelle solo lette", () => {
    expect(
      riconciliaDdtDiretto(bolla, [riga], [{ ...fattura, stato: "rifiutata" }], [legame]).fatture,
    ).toHaveLength(0);
    expect(
      riconciliaDdtDiretto(bolla, [riga], [{ ...fattura, company_cost_id: null }], [legame]).avvisi,
    ).toContain("Fattura da contabilizzare");
  });
});
