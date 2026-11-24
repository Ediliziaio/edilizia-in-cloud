/**
 * Il computo aperto dal preventivo e lo studio della variante leggono la stessa pianta:
 * per lo spostamento del tramezzo del progetto di collaudo devono dare le stesse voci,
 * con le stesse quantità e gli stessi importi (24/11/2026).
 */
import { describe, expect, it } from "vitest";
import { calcolaVoce } from "@/lib/computo/editorNativo";
import {
  confrontaComputoConPianta, misureDalProgetto, tipiDaQuotare, vociDallaPianta, type OrigineComputoPianta,
} from "@/lib/computo/computoDallaPianta";
import { importiLavorazioni, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { conPrezziProposti, FONTE_INDICATIVA, FONTI_VUOTE, type FontiPrezzi } from "@/lib/planimetrie/prezziProposti";
import { piantaCollaudoConVariante } from "../fixtures/piantaCollaudo";

const origine: OrigineComputoPianta = { id: "00000000-0000-4000-8000-000000000001", livelloId: "pt", propostaId: "A", titolo: "Collaudo", versione: 1 };
const doc = piantaCollaudoConVariante();
const UNITA = { "m²": "mq", m: "ml", cad: "pz", "a corpo": "a corpo" } as const;

/** Le voci del computo come lo studio le conta: descrizione, unità, quantità, prezzo, importo. */
function dalComputo(fonti: FontiPrezzi) {
  const opere = misureDalProgetto(doc, origine, fonti).filter(m => m.chiave.startsWith("opera:"));
  return vociDallaPianta(opere, 1).map(v => {
    const c = calcolaVoce(v);
    return [v.descrizione.split(" — ")[0], v.unita, c.quantita, c.prezzo, c.importo, v.fonte];
  });
}
function dalloStudio(fonti: FontiPrezzi) {
  return conPrezziProposti(studioVariante(doc, "A").righe, fonti).map(r =>
    [r.descrizione, UNITA[r.unita], r.quantita, r.prezzo!.importo, Math.round(r.quantita! * r.prezzo!.importo * 100) / 100, r.prezzo!.fonte]);
}
const ordina = <T,>(righe: T[]) => [...righe].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe("computo dalla pianta = studio della variante (tramezzo spostato di 40 cm)", () => {
  it("stesse voci, quantità, prezzi indicativi e importi, lavorazioni indotte comprese", () => {
    const computo = dalComputo(FONTI_VUOTE);
    expect(ordina(computo)).toEqual(ordina(dalloStudio(FONTI_VUOTE)));
    expect(computo.map(r => r[0])).toEqual(expect.arrayContaining([
      "Carico, trasporto e smaltimento delle macerie", "Ripristino del pavimento nella traccia della parete demolita",
      "Intonaco sulle due facce della nuova parete", "Tinteggiatura delle due facce della nuova parete", "Battiscopa ai piedi della nuova parete",
    ]));
    expect(computo.every(r => r[5] === FONTE_INDICATIVA)).toBe(true);
    const totale = Math.round(computo.reduce((t, r) => t + (r[4] as number), 0) * 100) / 100;
    expect(totale).toBe(importiLavorazioni(conPrezziProposti(studioVariante(doc, "A").righe)).importo);
    expect(totale).toBe(2642.4);
  });

  it("col listino dell'azienda prende gli stessi prezzi dello studio, e il resto indicativo con la fonte", () => {
    const fonti: FontiPrezzi = { ...FONTI_VUOTE, listino: [
      { codice: "DEM.01", descrizione: "Demolizione di tramezzi interni", unita: "mq", prezzo: 32.2 },
      { codice: "DEM.09", descrizione: "Trasporto e smaltimento macerie in discarica autorizzata", unita: "corpo", prezzo: 550 },
    ] };
    const computo = dalComputo(fonti);
    expect(ordina(computo)).toEqual(ordina(dalloStudio(fonti)));
    const voci = vociDallaPianta(misureDalProgetto(doc, origine, fonti).filter(m => m.chiave.startsWith("opera:")), 1);
    expect(voci.find(v => v.descrizione.startsWith("Demolizione tramezzo"))).toMatchObject({ prezzo: "32.2", fonte: "Listino aziendale", tariffa: "DEM.01" });
    expect(voci.find(v => v.descrizione.startsWith("Carico"))).toMatchObject({ prezzo: "550", unita: "a corpo", corpo: true });
    expect(voci.find(v => v.descrizione.startsWith("Intonaco"))).toMatchObject({ prezzo: "24", fonte: FONTE_INDICATIVA });
    expect(tipiDaQuotare(doc, origine)).toContain("intonaco");
  });

  it("senza fonti (chi non vede gli importi) le voci nascono senza prezzo", () => {
    expect(misureDalProgetto(doc, origine).every(m => !m.prezzo)).toBe(true);
  });

  it("ripetere la stessa modifica non crea righe doppie", () => {
    const proposte = misureDalProgetto(doc, origine, FONTI_VUOTE);
    expect(new Set(proposte.map(p => p.chiave)).size).toBe(proposte.length);
    expect(proposte.find(p => p.nome.startsWith("Intonaco"))?.chiave).toBe("opera:muro:n1:nuovo:tramezzo:intonaco");
    const importate = vociDallaPianta(proposte.filter(p => p.chiave.startsWith("opera:")), 1);
    const dopo = confrontaComputoConPianta(importate, misureDalProgetto(doc, origine, FONTI_VUOTE), 1);
    expect(dopo.disponibili.filter(p => p.chiave.startsWith("opera:"))).toEqual([]);
    expect(dopo.variazioni).toEqual([]);
    expect(dopo.daVerificare).toEqual([]);
  });

  it("le bozze salvate con le chiavi di prima si ricollegano", () => {
    const proposte = misureDalProgetto(doc, origine, FONTI_VUOTE);
    expect(proposte.find(p => p.chiave === "opera:muro:t1:da_demolire:tramezzo")?.chiavePrecedente).toBe("Soggiorno|Demolizione di tramezzo|mq");
    // Una bozza di prima del raggruppamento: la misura è legata a «stanza|descrizione|unità».
    const vecchia = vociDallaPianta(proposte.filter(p => p.chiave === "opera:muro:t1:da_demolire:tramezzo"), 1)
      .map(v => ({ ...v, misure: v.misure.map(m => ({ ...m, dallaPianta: { ...m.dallaPianta!, chiave: "Soggiorno|Demolizione di tramezzo|mq" } })) }));
    const r = confrontaComputoConPianta(vecchia, proposte, 1);
    expect(r.daVerificare).toEqual([]);
    expect(r.disponibili.some(p => p.chiave === "opera:muro:t1:da_demolire:tramezzo")).toBe(false);
  });
});
