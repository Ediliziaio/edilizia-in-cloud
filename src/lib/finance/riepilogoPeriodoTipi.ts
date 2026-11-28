/**
 * Contratto fra la parte dati e la parte grafica del riepilogo del periodo dello Scadenzario
 * (28/11/2026). La parte dati sta in `riepilogoPeriodoScadenzario.ts`, la grafica nella pagina.
 *
 * Il titolare vuole, in pochi clic, il mese: cosa scade, cosa è pagato, cosa resta, cosa è
 * rimasto indietro dai mesi prima. Tutti i numeri seguono i filtri della pagina (periodo,
 * fornitore, cantiere, modalità, ricerca); le annullate non contano mai.
 */
/** Le linguette dell'elenco che hanno un numero accanto. */
export const LINGUETTE_CON_CONTEGGIO = ["aperte", "tutte", "da_incassare", "da_pagare", "scadute", "pagate"] as const;
export type LinguettaConConteggio = (typeof LINGUETTE_CON_CONTEGGIO)[number];

/** Quante scadenze e quanti euro. */
export interface Somma { n: number; importo: number }

export interface RiepilogoDirezione {
  /** Tutte le scadenze del periodo (non annullate): importo pieno. */
  totale: Somma;
  /** Già pagato/incassato: importo = somma di paid_amount (anche delle parziali);
   *  n = scadenze saldate del tutto. */
  saldato: Somma;
  /** Ancora da pagare/incassare: importo = residuo; n = scadenze con residuo > 0. */
  aperto: Somma;
  /** La parte di `aperto` già scaduta (scadenza prima di oggi). */
  scaduto: Somma;
  /**
   * La parte di `aperto` coperta da assegni/effetti non ancora scaduti (28/11/2026): resta aperta,
   * non è pagata e non è scaduta. Assente se non ci sono effetti.
   */
  coperto?: Somma;
}

export interface RiepilogoPeriodo {
  entrate: RiepilogoDirezione;
  uscite: RiepilogoDirezione;
  /** Aperte con scadenza PRIMA dell'inizio del periodo, con gli stessi filtri entità/ricerca.
   *  null quando il periodo non ha un inizio (tutti gli anni). */
  arretrato: { entrate: Somma; uscite: Somma } | null;
  /** I numeri delle linguette per il periodo e i filtri attuali. */
  linguette: Record<LinguettaConConteggio, number>;
  /** true se le righe del periodo superano il tetto e i numeri sono parziali. */
  troncato: boolean;
}
