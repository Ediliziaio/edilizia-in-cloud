import { describe, expect, it } from "vitest";
import {
  controllaBozza,
  costruisciGiornale,
  csvGiornale,
  csvPianoDeiConti,
  htmlLibroGiornale,
  importo,
  type ContoContabile,
  type Scrittura,
} from "@/lib/contabilita/libroGiornale";

const conto = (id: string, codice: string, movimentabile = true): ContoContabile => ({
  id, codice, descrizione: `Conto ${codice}`, natura: "attivo", sezione_cee: "SPA", voce_cee: null,
  mastro_id: null, movimentabile, attivo: true,
});
const conti = [conto("m", "05", false), conto("clienti", "05.01"), conto("ricavi", "20.01"), conto("iva", "13.10")];

describe("importo", () => {
  it("legge la virgola italiana e il punto", () => {
    expect(importo("1.234,56")).toBe(1234.56);
    expect(importo("1234.56")).toBe(1234.56);
    expect(importo("")).toBe(0);
    expect(Number.isNaN(importo("abc"))).toBe(true);
  });
});

describe("controllaBozza", () => {
  it("una scrittura che quadra non ha problemi", () => {
    const e = controllaBozza([
      { conto_id: "clienti", dare: "122", avere: "", descrizione: "" },
      { conto_id: "ricavi", dare: "", avere: "100", descrizione: "" },
      { conto_id: "iva", dare: "", avere: "22", descrizione: "" },
    ], conti);
    expect(e.problemi).toEqual([]);
    expect(e.dare).toBe(122);
    expect(e.differenza).toBe(0);
  });
  it("dice la differenza, il mastro e la riga con dare e avere insieme", () => {
    const e = controllaBozza([
      { conto_id: "m", dare: "100", avere: "", descrizione: "" },
      { conto_id: "ricavi", dare: "5", avere: "90", descrizione: "" },
    ], conti);
    expect(e.problemi).toContain("Riga 1: scegli un conto, non un mastro");
    expect(e.problemi).toContain("Riga 2: un importo in dare oppure in avere");
    expect(e.problemi.some((p) => p.startsWith("Non quadra"))).toBe(true);
  });
  it("non sbaglia i centesimi (0,1 + 0,2)", () => {
    const e = controllaBozza([
      { conto_id: "clienti", dare: "0,1", avere: "", descrizione: "" },
      { conto_id: "clienti", dare: "0,2", avere: "", descrizione: "" },
      { conto_id: "ricavi", dare: "", avere: "0,3", descrizione: "" },
    ], conti);
    expect(e.differenza).toBe(0);
    expect(e.problemi).toEqual([]);
  });
});

describe("libro giornale", () => {
  const s = (numero: number, data: string, righe: Array<[string, number, number]>): Scrittura => ({
    id: `s${numero}`, esercizio: 2026, numero, data_registrazione: data, causale: "Prova", descrizione: null,
    documento_numero: null, documento_data: null, origine: "manuale", storno_di: null,
    contabilita_righe: righe.map(([c, d, a], i) => ({ riga: i + 1, conto_id: c, dare: d, avere: a, descrizione: null as string | null })),
  });
  it("ordina per data e numero e porta i progressivi", () => {
    const g = costruisciGiornale([
      s(2, "2026-02-01", [["clienti", 50, 0], ["ricavi", 0, 50]]),
      s(1, "2026-01-10", [["clienti", 122, 0], ["ricavi", 0, 100], ["iva", 0, 22]]),
    ], conti);
    expect(g.righe.map((r) => r.numero)).toEqual(["1/2026", "1/2026", "1/2026", "2/2026", "2/2026"]);
    expect(g.totaleDare).toBe(172);
    expect(g.totaleAvere).toBe(172);
    expect(g.righe[3].primaDellaScrittura).toBe(true);
    expect(g.righe[4].progressivoDare).toBe(172);
  });
  it("una scrittura inserita dopo con data precedente prende il numero del suo giorno", () => {
    const g = costruisciGiornale([
      s(1, "2026-03-01", [["clienti", 10, 0], ["ricavi", 0, 10]]),
      s(2, "2026-01-15", [["clienti", 20, 0], ["ricavi", 0, 20]]),
    ], conti);
    const teste = g.righe.filter((r) => r.primaDellaScrittura);
    expect(teste.map((r) => [r.numero, r.registrazione])).toEqual([["1/2026", "2/2026"], ["2/2026", "1/2026"]]);
    expect(teste[0].causale).toContain("reg. n. 2");
  });
  it("il foglio di stampa porta titolo, conti e totali", () => {
    const html = htmlLibroGiornale({
      azienda: { ragione_sociale: "Prova srl" },
      scritture: [s(1, "2026-01-10", [["clienti", 122, 0], ["ricavi", 0, 122]])],
      conti, dal: "2026-01-01", al: "2026-12-31",
    });
    expect(html).toContain("Libro giornale");
    expect(html).toContain("05.01 Conto 05.01");
    expect(html).toContain("122,00");
  });
  it("la stampa di un periodo continua numeri e progressivi dell'esercizio", () => {
    const html = htmlLibroGiornale({
      azienda: { ragione_sociale: "Prova srl" },
      scritture: [s(1, "2026-01-10", [["clienti", 122, 0], ["ricavi", 0, 122]]), s(2, "2026-04-02", [["clienti", 10, 0], ["ricavi", 0, 10]])],
      conti, dal: "2026-04-01", al: "2026-06-30", definitiva: true,
    });
    expect(html).toContain("stampa definitiva");
    expect(html).toContain("2/2026");
    expect(html).not.toContain("1/2026");
    expect(html).toContain("Riporto");
    expect(html).toContain("132,00");
    expect(html).toContain("partita doppia tenuta con Edilizia in Cloud");
  });
  it("esporta giornale e piano dei conti in CSV per lo studio", () => {
    const csv = csvGiornale([s(1, "2026-01-10", [["clienti", 122.5, 0], ["ricavi", 0, 122.5]])], conti);
    const righe = csv.split("\r\n");
    expect(righe).toHaveLength(3);
    expect(righe[1]).toContain(";10/01/2026;");
    expect(righe[1]).toContain(";122,50;0,00;");
    expect(csvPianoDeiConti(conti).split("\r\n")[0]).toContain("Voce CEE");
  });
});
