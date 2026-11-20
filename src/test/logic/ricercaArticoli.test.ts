import { describe, expect, it } from "vitest";
import { corrispondeRicercaArticolo } from "@/lib/distinta/navigazioneArticoli";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";
const m: Pick<MaterialeFase, "name" | "description" | "specifiche" | "origini" | "posizioni" | "locale"> = {
  name: "Serramento in alluminio", description: null, specifiche: "Triplo vetro", locale: "Cucina",
  posizioni: [{ descrizione: "Vano nord", misure: "100 × 150", quantita: 1 }],
  origini: [{ tipo: "computo", voce_id: "v1", codice: "DB150342a", descrizione: "Finestra a taglio termico", quantita: 13, quantita_voce: 13, unita_voce: "pz" }],
};
describe("ricerca nelle fonti degli articoli", () => {
  it("trova il codice del computo anche se non è nel nome o nel riferimento dell'articolo", () => {
    expect(corrispondeRicercaArticolo(m, "db150342a")).toBe(true);
    expect(corrispondeRicercaArticolo(m, "DB150999")).toBe(false);
  });
  it("trova misure e locale senza dipendere da accenti e simbolo di moltiplicazione", () => {
    expect(corrispondeRicercaArticolo(m, "cucìna 100 x 150")).toBe(true);
    expect(corrispondeRicercaArticolo(m, "vano sud")).toBe(false);
  });
  it("combina parole del prodotto con il testo fonte e richiede tutti i termini", () => {
    expect(corrispondeRicercaArticolo(m, "serramento taglio termico")).toBe(true);
    expect(corrispondeRicercaArticolo(m, "serramento legno")).toBe(false);
    expect(corrispondeRicercaArticolo({ ...m, origini: null, posizioni: null }, "  ")).toBe(true);
  });
});
