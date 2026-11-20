import { describe, expect, it } from "vitest";
import { bozzaDelMateriale, bozzaModificata, specificheGiaLette, type MaterialeDaVerificare } from "@/lib/distinta/bozzaVerificaMateriale";
import type { OrigineRiga } from "@/lib/distinta/generaDistinta";
const origine: Extract<OrigineRiga, { tipo: "contratto" }> = { tipo: "contratto", documento_ref: "d1", posizione_ref: "p1", descrizione: "Batteria modello A", quantita: 1,
  verifica_acquisto: { stato: "da_verificare", motivi: ["Unità da confermare"], campi_mancanti: ["unita"] },
  dati_documentali: { versione: 1, quantita: "ricostruita", quantita_documento: null, unita_documento: null, specifiche: [], dati_mancanti: ["Unità da confermare"], componenti_inclusi: [],
    fonti: [{ voce_id: "v1", numero: "1", descrizione: "Batteria modello A, 16 kWh e IP65", quantita: 1, unita: null }] } };
const materiale: MaterialeDaVerificare = { id: "m1", order_id: "o1", name: "Batteria modello A", quantity: 1, unita_misura: "pz", specifiche: null, origini: [origine] };
describe("riutilizzo delle caratteristiche già documentate", () => {
  it("precompila il testo già letto quando il dubbio è soltanto l'unità, senza approvarla", () => {
    const prima = structuredClone(materiale);
    expect(bozzaDelMateriale(materiale).specifiche).toBe("Batteria modello A, 16 kWh e IP65");
    expect(bozzaModificata(materiale, bozzaDelMateriale(materiale))).toBe(false);
    expect(materiale).toEqual(prima);
  });
  it("conserva le caratteristiche dell'utente senza sostituirle con la fonte", () => {
    expect(specificheGiaLette({ ...materiale, specifiche: "Modello B verificato" })).toBe("Modello B verificato");
  });
  it("non riempie un modello mancante con una descrizione generica né usa una resa stimata come dato certo", () => {
    const modello = { ...origine, verifica_acquisto: { ...origine.verifica_acquisto!, campi_mancanti: ["modello", "unita"] } };
    expect(specificheGiaLette({ ...materiale, origini: [modello] })).toBe("");
    const stimata = { ...origine, dati_documentali: { ...origine.dati_documentali!, quantita: "stimata" as const, specifiche: ["Valore stimato"] } };
    expect(specificheGiaLette({ ...materiale, origini: [stimata] })).toBe("");
    expect(specificheGiaLette({ ...materiale, origini: [origine, origine] })).toBe("");
  });
});
