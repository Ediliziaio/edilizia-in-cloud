/**
 * Traccia dei collegamenti — componente comune (§7.2).
 *
 * Il formato di una riga di `public.acquisti_collegamenti`: chi è collegato a
 * cosa, per quale quantità e importo, con quale regola e quali prove, chi l'ha
 * fatto e quando, in che stato. La storia di ogni cambio sta in
 * `public.acquisti_collegamenti_storia` (la scrive un trigger, non il codice).
 *
 * Gli stati sono distinti e in quest'ordine; nessuno implica il successivo:
 *   proposto → collegato → verificato → approvato_pagamento → pagato
 * più `rifiutato` (una persona ha detto no: non si ripropone uguale) e
 * `annullato` (era collegato, è stato tolto: resta nella storia).
 */
import type { Decisione, Prova } from "./riconciliazione.ts";
import type { Percorso } from "./catena.ts";

export type TipoDocumento =
  | "fattura_ricevuta"
  | "ddt"
  | "riga_ddt"
  | "ordine"
  | "riga_ordine"
  | "contratto"
  | "commessa"
  | "fase"
  | "magazzino"
  | "anagrafica"
  | "movimento_banca"
  | "rapportino"
  | "sal"
  | "costo"
  // Tesoreria (20290404260000)
  | "fattura_emessa"
  | "documento_fiscale"
  | "scadenza"
  | "movimento_cassa"
  | "prima_nota"
  | "rata_fornitore"
  | "rata_commessa";

export type StatoCollegamento =
  | "proposto"
  | "collegato"
  | "verificato"
  | "approvato_pagamento"
  | "pagato"
  | "rifiutato"
  | "annullato";

/** Tipi che il database riconosce (`acquisti_documento_dell_azienda`). Una riga si indica con `riga`. */
export interface RiferimentoTraccia {
  tipo: TipoDocumento;
  id: string;
  /** Per le righe: l'identificativo della riga nel documento (NumeroLinea per l'XML). */
  riga?: string | null;
}

export interface Collegamento {
  companyId: string;
  da: RiferimentoTraccia;
  a: RiferimentoTraccia;
  quantita?: number | null;
  unita?: string | null;
  importo?: number | null;
  /** Il nome della regola: «ddt_numero_data_fornitore», «xml_ordine_acquisto», «manuale»… */
  regola: string;
  /** Versione della regola: un collegamento fatto da una regola poi corretta si ritrova. */
  versioneRegola: number;
  esito: Decisione["esito"];
  prove: Prova[];
  percorso?: Percorso[];
  stato: StatoCollegamento;
  /** «utente» con l'id, o «processo» col nome del lavoro. */
  autore: { tipo: "utente"; id: string } | { tipo: "processo"; nome: string };
  /** Chiave di idempotenza: lo stesso lavoro ripetuto non crea due collegamenti. */
  chiave: string;
  /** true se l'AI ha contribuito a leggere un dato (non a decidere). */
  conAi?: boolean;
}

/**
 * La chiave di idempotenza di un collegamento: stessa azienda, stessi due
 * estremi, stessa regola. Ritentare un lavoro, o farlo girare due volte in
 * parallelo, produce la stessa chiave, e il vincolo UNIQUE fa il resto.
 */
export function chiaveCollegamento(c: Pick<Collegamento, "companyId" | "da" | "a" | "regola">): string {
  const r = (x: RiferimentoTraccia) => `${x.tipo}:${x.id}${x.riga ? `#${x.riga}` : ""}`;
  return `${c.companyId}|${r(c.da)}|${r(c.a)}|${c.regola}`;
}

/** Lo stato iniziale di un collegamento dall'esito del motore. Scelta, conflitto e nessuno non si scrivono. */
export function statoDaEsito(e: Decisione["esito"]): StatoCollegamento | null {
  if (e === "automatico") return "collegato";
  if (e === "proposta") return "proposto";
  return null;
}

/** Le transizioni ammesse. Il database fa lo stesso controllo (`acquisti_collegamento_cambia_stato`). */
const TRANSIZIONI: Record<StatoCollegamento, StatoCollegamento[]> = {
  proposto: ["collegato", "rifiutato"],
  collegato: ["verificato", "annullato"],
  verificato: ["approvato_pagamento", "annullato"],
  approvato_pagamento: ["pagato", "verificato", "annullato"],
  pagato: [],
  rifiutato: ["proposto"],
  annullato: ["proposto"],
};

export function transizioneAmmessa(da: StatoCollegamento, a: StatoCollegamento): boolean {
  return TRANSIZIONI[da].includes(a);
}
