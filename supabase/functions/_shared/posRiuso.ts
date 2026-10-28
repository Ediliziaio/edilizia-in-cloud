import { tecnicaPosRiutilizzabile } from "./posTecnica.ts";
import { normalizzaPos, type Lavorazione, type PosContenuto } from "./posModello.ts";

/** Explicit allowlist: never serialize a whole site POS into a company standard. */
export function lavorazioniRiutilizzabili(contenuto: unknown): Lavorazione[] {
  return normalizzaPos(contenuto).lavorazioni.map((l, i) => ({
    id: `riuso-${i + 1}`, titolo: l.titolo, descrizione: l.descrizione,
    modalita: l.modalita, sostanze: l.sostanze, opere_provvisionali: l.opere_provvisionali,
    macchine: l.macchine, impianti: l.impianti, rischi: l.rischi, misure: l.misure, dpi: l.dpi,
    turni: "", durata_giorni: null, svolgimento: "diretto", svolgimento_con: "",
    origine: "modello", verificata: false,
    ...(l.tecnica ? {tecnica:tecnicaPosRiutilizzabile(l.tecnica)} : {}),
  }));
}

/** Destination data is authoritative; no source people, appointments, files or site data. */
export function applicaRiusoPos(destinazione: PosContenuto, sorgente: unknown): PosContenuto {
  const lavorazioni=lavorazioniRiutilizzabili(sorgente);
  return { ...destinazione, versione_controlli: 2, ...(normalizzaPos(sorgente).versione_requisiti_addetti===1?{versione_requisiti_addetti:1 as const}:{}), ...(normalizzaPos(sorgente).versione_documenti_mezzi===1?{versione_documenti_mezzi:1 as const}:{}), ...(normalizzaPos(sorgente).versione_mezzi===1?{versione_mezzi:1 as const}:{}), ...(normalizzaPos(sorgente).versione_fonti_tecniche===1?{versione_fonti_tecniche:1 as const}:{}), ...(lavorazioni.some(l=>l.tecnica)?{versione_tecnica:1 as const}:{}), lavorazioni };
}
