import { describe, expect, it } from "vitest";
import { bilancio, combinazioniEsatte, filtraDocumenti, importoProposto, meseStipendi, nettoBonificoParlante, problemaQuote, quotePerServer, type DocumentoAperto, type Quota } from "@/lib/primaNota/quoteMovimento";

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

  it("gli stipendi: il mese è quello prima (a gennaio, dicembre dell'anno prima) e al server vanno dipendente e mese", () => {
    expect(meseStipendi(new Date(2026, 10, 23))).toEqual({ anno: 2026, mese: 10 });
    expect(meseStipendi(new Date(2027, 0, 10))).toEqual({ anno: 2026, mese: 12 });
    const q: Quota = { chiave: "s", tipo: "dipendente", dipendente: { id: "e1", nome: "Rossi Mario", origine: "scheda" }, anno: 2026, mese: 10, importo: "" };
    expect(problemaQuote("1500", [q])).toBe("Manca l'importo per lo stipendio di Rossi Mario.");
    expect(problemaQuote("1500", [{ ...q, importo: "1500" }])).toBeNull();
    expect(quotePerServer([{ ...q, importo: "1500,456" }])).toEqual([{ tipo: "dipendente", id: "e1", anno: 2026, mese: 10, importo: 1500.46 }]);
  });

  it("la nota di credito non è denaro: non entra nel totale e va su una fattura del movimento", () => {
    const f: DocumentoAperto = { ...doc("f1", "Fornitore", 253.05), tipo: "fattura_ricevuta", numero: "432" };
    const n: DocumentoAperto = { ...doc("n1", "Fornitore", 21.45), tipo: "nota_credito", numero: "NC9" };
    const qf: Quota = { chiave: "a", tipo: "fattura_ricevuta", documento: f, importo: "231.60" };
    const qn: Quota = { chiave: "b", tipo: "nota_credito", documento: n, fatturaChiave: "a", importo: "21.45" };
    expect(bilancio("231.60", [qf, qn]).mancano).toBe(0);
    expect(problemaQuote("231.60", [qf, qn])).toBeNull();
    expect(problemaQuote("231.60", [qf, { ...qn, fatturaChiave: null }])).toBe("Scegli la fattura su cui va la nota di credito NC9.");
    expect(quotePerServer([qf, qn])[1]).toEqual({ tipo: "nota_credito", id: "n1", fattura_id: "f1", importo: 21.45 });
    expect(combinazioniEsatte([n], "21.45")).toEqual([]);
  });

  it("bonifico parlante: 11% sul lordo diviso 1,22; la fattura si salda per il lordo, in banca il netto", () => {
    expect(nettoBonificoParlante("11000")).toEqual({ ritenuta: 991.8, netto: 10008.2 });
    const d = doc("d1", "Rossi", 11000, "2026-10-01", "7");
    const q: Quota = { chiave: "r", tipo: "documento", documento: d, importo: "10008.20", ritenuta: true, lordo: "11000" };
    expect(problemaQuote("10008.20", [q])).toBeNull();
    expect(problemaQuote("10008.20", [{ ...q, lordo: "12000" }])).toBe("Per la fattura 7 il lordo supera il residuo.");
    expect(quotePerServer([q])).toEqual([{ tipo: "documento", id: "d1", importo: 10008.2, ritenuta: true, lordo: 11000 }]);
  });

  it("l'F24 è una quota con la sua riga: al server vanno riga e importo", () => {
    const q: Quota = { chiave: "f", tipo: "f24", f24: { id: "x1", descrizione: "F24 1001 · 10/2026" }, importo: "2280" };
    expect(problemaQuote("2280", [q])).toBeNull();
    expect(quotePerServer([q])).toEqual([{ tipo: "f24", id: "x1", importo: 2280 }]);
  });
});
