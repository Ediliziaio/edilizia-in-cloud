import { describe, expect, it } from "vitest";
import { fattoInCantiere, vociDaAllegato } from "@/lib/subappaltatori/lavoriMisure";

let n = 0;
const id = () => `v${++n}`;

describe("quadro lavori dall'Allegato A", () => {
  it("riprende le righe: a corpo, a ore, a misura", () => {
    const voci = vociDaAllegato([
      { fase: "Gas", descrizione: "Linea gas", unita: "m", quantita: 12.5, prezzo: 40, importo: 500 },
      { fase: "Gas", descrizione: "Allaccio", unita: "a corpo", quantita: 1, prezzo: 300, importo: 300 },
      { fase: "Gas", descrizione: "Assistenza", unita: "h", quantita: 2, prezzo: 35, importo: 70 },
    ], 870, id)!;
    expect(voci.map((v) => [v.base, v.unita, v.quantita, v.prezzo])).toEqual([
      ["misura", "m", 12.5, 40], ["corpo", "quota", 1, 300], ["ore", "h", 2, 35],
    ]);
  });
  it("se l'elenco non torna all'importo del contratto non lo usa", () => {
    expect(vociDaAllegato([{ descrizione: "Linea gas", unita: "m", quantita: 1, prezzo: 10 }], 999, id)).toBeNull();
  });
  it("senza elenco o con righe vuote non lo usa", () => {
    expect(vociDaAllegato([], 0, id)).toBeNull();
    expect(vociDaAllegato(null, 0, id)).toBeNull();
    expect(vociDaAllegato([{ descrizione: "", unita: "m", quantita: 1, prezzo: 1 }], 1, id)).toBeNull();
  });
});

describe("Dal contratto ai SAL della ditta", () => {
  const id = (() => { let n = 0; return () => `v${++n}`; })();
  it("la voce conserva la fase", () => {
    const voci = vociDaAllegato([{ descrizione: "Tracce", unita: "m", quantita: 2, prezzo: 5, fase: "Impianti", fase_id: "f1" }], 10, id);
    expect(voci?.[0].fase_id).toBe("f1");
  });
  it("oltre 100 righe una voce a corpo per fase, e il totale torna", () => {
    const righe = Array.from({ length: 120 }, (_, i) => ({ descrizione: `Voce ${i}`, unita: "m", quantita: 1, prezzo: 1.5, fase: i < 80 ? "A" : "B", fase_id: i < 80 ? "fa" : "fb" }));
    const voci = vociDaAllegato(righe, 180, id)!;
    expect(voci.map((v) => [v.fase_id, v.base, v.prezzo, v.descrizione])).toEqual([["fa", "corpo", 120, "A (80 lavorazioni)"], ["fb", "corpo", 60, "B (40 lavorazioni)"]]);
  });
  const cantiere = [
    { phase_id: "f1", descrizione: "Tracce", percentuale: 50, quantita_fatta: 30, quantita: 60 },
    { phase_id: "f1", descrizione: "Cavi", percentuale: 100, quantita_fatta: null, quantita: 20 },
  ];
  it("riprende il fatto: quantità scritta, altrimenti dalla percentuale", () => {
    expect(fattoInCantiere({ fase_id: "f1", descrizione: " tracce ", base: "misura", quantita: 60 }, cantiere)).toBe(30);
    expect(fattoInCantiere({ fase_id: "f1", descrizione: "Cavi", base: "misura", quantita: 20 }, cantiere)).toBe(20);
  });
  it("a corpo su tutta la fase fa la media pesata sulle quantità", () => {
    expect(fattoInCantiere({ fase_id: "f1", descrizione: "Impianti (2 lavorazioni)", base: "corpo", quantita: 1 }, cantiere)).toBeCloseTo((60 * 50 + 20 * 100) / 80 / 100, 3);
  });
  it("senza fase o senza riga non inventa un numero", () => {
    expect(fattoInCantiere({ fase_id: null, descrizione: "Tracce", base: "misura", quantita: 60 }, cantiere)).toBeNull();
    expect(fattoInCantiere({ fase_id: "f1", descrizione: "Altro", base: "misura", quantita: 1 }, cantiere)).toBeNull();
  });
});
