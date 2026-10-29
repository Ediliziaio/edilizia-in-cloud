import { describe, expect, it } from "vitest";
import { bozzaVuota, misuraVuota, voceVuota, calcolaVoce } from "@/lib/computo/editorNativo";
import { scriviComputoXpwe } from "@/lib/computo/scriviXpwe";
import { leggiComputoXpwe } from "@/lib/computo/xpwe";

/** Esportazione XPWE (29/10/2026): quello che esce si rilegge identico col nostro lettore di PriMus. */
describe("esportazione XPWE per PriMus", () => {
  const bozza = { ...bozzaVuota(), titolo: "Campo da tennis", oggetto: "Campo 18 × 36 & recinzione", committente: "Circolo <Monza>", voci: [
    { ...voceVuota(), capitolo: "Scavi", tariffa: "NP.01", descrizione: "Scavo di sbancamento\nfino a 40 cm", unita: "mc", quantita: "", prezzo: "12", misure: [
      { ...misuraVuota(), descrizione: "Area campo", parti: "1", lunghezza: "36", larghezza: "18", altezza: "0,4" }] },
    { ...voceVuota(), capitolo: "Manto", descrizione: "Manto in resina acrilica", unita: "mq", quantita: "648", prezzo: "32,5" },
    { ...voceVuota(), capitolo: "Manto", descrizione: "Detrazione area già pavimentata", unita: "mq", quantita: "10", prezzo: "32,5", detrazione: true },
  ] };
  it("andata e ritorno: voci, capitoli, misure, quantità e prezzi", () => {
    const letto = leggiComputoXpwe(scriviComputoXpwe(bozza, "Impresa Esempio"));
    expect(letto.voci).toHaveLength(3);
    expect(letto.metadata).toMatchObject({ committente: "Circolo <Monza>", oggetto_lavori: "Campo 18 × 36 & recinzione", impresa: "Impresa Esempio" });
    expect(letto.voci[0]).toMatchObject({ prezzo_unitario: 12, quantita: 259.2 });
    expect(letto.voci[0].misure[0]).toMatchObject({ lunghezza: 36, larghezza: 18, altezza_peso: 0.4 });
    expect(letto.voci[0].super_categoria?.nome).toBe("Scavi");
    expect(letto.voci[1]).toMatchObject({ prezzo_unitario: 32.5, quantita: 648 });
    expect(letto.voci[2].quantita).toBe(-10);
    expect(letto.voci[0].descrizione ?? letto.voci[0]).toBeTruthy();
    expect(calcolaVoce(bozza.voci[0]).importo).toBeCloseTo(3110.4, 2);
  });
});
