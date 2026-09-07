/**
 * Dove si apre un preventivo, dato il suo tipo.
 *
 * I preventivi vivono in undici posti diversi — `quotes` per i classici, una
 * tabella per ciascun verticale — e ognuno ha la sua pagina. La mappa esisteva
 * solo dentro `UnifiedPreventiviList`, che è l'unico punto che li mostrava
 * tutti; ogni altra schermata leggeva `quotes` e basta, e per questo la scheda
 * cliente diceva "nessun preventivo" mentre ce n'erano.
 *
 * Ora che anche la scheda cliente legge `v_preventivi_unificati`, la mappa
 * serve in due posti: sta qui, così un verticale nuovo si aggiunge una volta
 * sola e nessuna schermata resta indietro con un collegamento che non apre
 * niente.
 */

/** I tipi che la vista `v_preventivi_unificati` può restituire. */
export type TipoPreventivo =
  | "classico"
  | "serramenti"
  | "fotovoltaico"
  | "ristrutturazione"
  | "bagni"
  | "tetti"
  | "climatizzazione"
  | "elettrico"
  | "termoidraulico"
  | "pavimenti"
  | "piscine";

/** Percorso della pagina che apre quel preventivo, per tipo. */
const PERCORSO: Record<TipoPreventivo, (id: string) => string> = {
  classico: (id) => `/azienda/marketing/preventivi/${id}`,
  fotovoltaico: (id) => `/azienda/marketing/fotovoltaico/${id}`,
  serramenti: (id) => `/azienda/serramenti/${id}/modifica`,
  ristrutturazione: (id) => `/azienda/ristrutturazione/${id}/modifica`,
  bagni: (id) => `/azienda/bagni/${id}/modifica`,
  tetti: (id) => `/azienda/tetti/${id}/modifica`,
  climatizzazione: (id) => `/azienda/climatizzazione/${id}/modifica`,
  elettrico: (id) => `/azienda/elettrico/${id}/modifica`,
  termoidraulico: (id) => `/azienda/termoidraulico/${id}/modifica`,
  pavimenti: (id) => `/azienda/pavimenti/${id}/modifica`,
  piscine: (id) => `/azienda/piscine/${id}/modifica`,
};

/** Etichetta leggibile del tipo, per quando accanto al numero serve dire di che si tratta. */
const ETICHETTA: Record<TipoPreventivo, string> = {
  classico: "Classico",
  serramenti: "Serramenti",
  fotovoltaico: "Fotovoltaico",
  ristrutturazione: "Ristrutturazione",
  bagni: "Bagni",
  tetti: "Tetti",
  climatizzazione: "Climatizzazione",
  elettrico: "Elettrico",
  termoidraulico: "Termoidraulico",
  pavimenti: "Pavimenti",
  piscine: "Piscine",
};

/**
 * Restituisce l'indirizzo della pagina del preventivo, oppure `null` se il tipo
 * non è fra quelli conosciuti. Chi chiama deve trattare il `null` come "non
 * apribile" e non renderlo cliccabile: un collegamento che non porta da nessuna
 * parte è peggio di nessun collegamento.
 */
export function linkPreventivo(tipo: string | null | undefined, id: string): string | null {
  if (!tipo) return null;
  const costruisci = PERCORSO[tipo as TipoPreventivo];
  return costruisci ? costruisci(id) : null;
}

/** Etichetta leggibile del tipo; se sconosciuto restituisce il tipo grezzo. */
export function etichettaTipoPreventivo(tipo: string | null | undefined): string | null {
  if (!tipo) return null;
  return ETICHETTA[tipo as TipoPreventivo] ?? tipo;
}
