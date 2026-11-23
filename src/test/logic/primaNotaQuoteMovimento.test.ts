import { describe, expect, it } from "vitest";
import { bilancio, combinazioniEsatte, filtraDocumenti, importoProposto, problemaQuote, quotePerServer, type DocumentoAperto, type Quota } from "@/lib/primaNota/quoteMovimento";

const doc = (id: string, controparte: string, residuo: number, data = "2026-10-01", numero = id): DocumentoAperto =>
  ({ tipo: "documento", id, numero, data, controparte, totale: residuo, residuo, order_id: null, order_code: null });
const quota = (d: DocumentoAperto, importo: string): Quota => ({ chiave: d.id, tipo: d.tipo, documento: d, importo });

describe("movimento diviso in quote", () => {
  it("il bilancio dice quanto manca, in centesimi senza errori di virgola", () => {
    const q = [quota(doc("a", "Rossi", 0.1), "0.1"), quota(doc("b", "Rossi", 0.2), "0,2")];
    expect(bilancio("0.3", q)).toEqual({ totale: 30, assegnato: 30, mancano: 0 });
  });

  it("una quota nuova propone il residuo, o quello che manca se è meno (acconto)", () => {
    expect(importoProposto(1200, 0)).toBe("1200.00");
    expect(importoProposto(1200, 200000)).toBe("1200.00");
    expect(importoProposto(1200, 30000)).toBe("300.00");
  });

  it("non si salva finché le quote non tornano col movimento, né oltre il residuo", () => {
    const a = doc("a", "Rossi", 100, "2026-01-01", "12");
    expect(problemaQuote("100", [])).toBe("Aggiungi almeno una fattura o una voce.");
    expect(problemaQuote("150", [quota(a, "100")])).toMatch(/^Mancano 50,00/);
    expect(problemaQuote("100", [quota(a, "120")])).toBe("Per la fattura 12 l'importo supera il residuo.");
    expect(problemaQuote("100", [{ chiave: "l", tipo: "libera", categoria: "", orderId: null, descrizione: "", importo: "100" }])).toBe("Scegli la categoria per una voce senza fattura.");
    expect(problemaQuote("100", [quota(a, "100")])).toBeNull();
  });

  it("trova le fatture dello stesso cliente che fanno esattamente l'importo", () => {
    const docs = [doc("1", "Rossi Srl", 1000), doc("2", "Rossi Srl", 2500.5), doc("3", "Rossi Srl", 400), doc("4", "Bianchi", 3500.5)];
    const p = combinazioniEsatte(docs, "3500.50");
    expect(p.map(c => c.map(d => d.id))).toEqual([["4"], ["1", "2"]]);
    expect(combinazioniEsatte(docs, "123")).toEqual([]);
  });

  it("la ricerca ignora maiuscole e accenti e salta le fatture già scelte", () => {
    const docs = [doc("1", "Società Edile", 10), doc("2", "Societa Edile", 20), doc("3", "Altro", 30)];
    expect(filtraDocumenti(docs, "SOCIETA", new Set(["documento:2"])).map(d => d.id)).toEqual(["1"]);
  });

  it("al server vanno tipo, documento e importo; la voce libera porta categoria e commessa", () => {
    expect(quotePerServer([quota(doc("a", "R", 10), "10"), { chiave: "l", tipo: "libera", categoria: "commissioni", orderId: "o1", descrizione: " RiBa ", importo: "2,5" }])).toEqual([
      { tipo: "documento", id: "a", importo: 10 },
      { tipo: "libera", importo: 2.5, categoria: "commissioni", order_id: "o1", descrizione: "RiBa" },
    ]);
  });
});
