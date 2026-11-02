import { describe, expect, it } from "vitest";
import { righeEsportazione, type RigaRapportino } from "@/lib/campo/esportaRapportini";

const riga = (p: Partial<RigaRapportino> = {}): RigaRapportino => ({
  data_lavoro: "2026-11-02", stato: "approvato", ore_lavorate: 8, descrizione_lavori: "Posa", autore: { first_name: "Mario", last_name: "Rossi" }, campi_extra: [], ...p,
});

describe("righeEsportazione", () => {
  it("ha le colonne di sempre più una per campo", () => {
    const { colonne, righe } = righeEsportazione([riga({ campi_extra: [{ chiave: "p", etichetta: "Pezzi", tipo: "number", valore: 12, unita: "pz", stampa: "interno" }] })]);
    expect(colonne).toEqual(["Data", "Autore", "Stato", "Ore", "Descrizione", "Pezzi (pz)"]);
    expect(righe[0]).toEqual(["02/11/2026", "Mario Rossi", "Approvato", 8, "Posa", 12]);
  });
  it("un campo per fase ha una colonna per fase", () => {
    const { colonne, righe } = righeEsportazione([riga({ campi_extra: [
      { chiave: "p", etichetta: "Pezzi", tipo: "number", valore: 1, stampa: "interno", phase_id: "a", fase_nome: "Posa" },
      { chiave: "p", etichetta: "Pezzi", tipo: "number", valore: 2, stampa: "interno", phase_id: "b", fase_nome: "Sigillature" },
    ] })]);
    expect(colonne.slice(5)).toEqual(["Pezzi (Posa)", "Pezzi (Sigillature)"]);
    expect(righe[0].slice(5)).toEqual([1, 2]);
  });
  it("un rapportino senza valore lascia la cella vuota", () => {
    const { righe } = righeEsportazione([
      riga({ campi_extra: [{ chiave: "a", etichetta: "A", tipo: "text", valore: "x", stampa: "mai" }] }),
      riga(),
    ]);
    expect(righe[1][5]).toBe("");
  });
  it("esce anche un campo non stampato, e sì/no in parole", () => {
    const { righe } = righeEsportazione([riga({ campi_extra: [{ chiave: "a", etichetta: "A", tipo: "boolean", valore: true, stampa: "mai" }] })]);
    expect(righe[0][5]).toBe("Sì");
  });
  it("un testo che inizia con = non diventa una formula", () => {
    const { righe } = righeEsportazione([riga({ descrizione_lavori: "=1+1", campi_extra: [{ chiave: "a", etichetta: "A", tipo: "text", valore: "=SOMMA(A1)", stampa: "mai" }] })]);
    expect(String(righe[0][4]).startsWith("=")).toBe(false);
    expect(String(righe[0][5]).startsWith("=")).toBe(false);
  });
  it("le etichette non diventano formule", () => {
    const { colonne } = righeEsportazione([riga({ campi_extra: [{ chiave: "a", etichetta: "=X", tipo: "text", valore: "v", stampa: "mai" }] })]);
    expect(colonne[5].startsWith("=")).toBe(false);
  });
});
