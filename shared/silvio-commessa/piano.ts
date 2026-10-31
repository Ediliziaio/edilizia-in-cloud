/**
 * Il piano della commessa che Silvio prepara (31/10/2026): il contratto comune fra lettori,
 * popup, chat, RPC e test. Vedi docs/piano-silvio-commessa-ai.md, sezioni 2 e 5.
 *
 * Senza dipendenze: lo importano il browser (`src/`), le edge function (Deno) e i test.
 * Qui ci sono solo i tipi e i nomi; la fusione (`fondi`), le modifiche (`applica`), il
 * registro delle variabili e il punteggio di completezza stanno accanto, nella fase 0.
 */

/** Le 14 aree della commessa (sezione 2 del piano). L'ordine è quello del popup. */
export const AREE = [
  "identita", "cliente", "cantiere", "economia", "pagamenti", "fasi", "persone",
  "ditte", "costi", "mezzi", "materiali", "sicurezza", "sal_scadenze", "comunicazione",
] as const;
export type Area = (typeof AREE)[number];

/** 🟢 da solo · 🟡 propone · 🔴 mai da solo (bozza) · ❓ solo se manca. */
export type Livello = "da_solo" | "propone" | "mai_da_solo" | "chiede";

/** Lo stato che il popup mostra per un valore o per un'area. */
export type Stato = "fatto" | "proposta" | "manca" | "attenzione";

/** Da dove viene un valore, dalla più fidata alla meno (sezione 3.3). */
export const TIPI_FONTE = [
  "persona",            // scritto da una persona (commessa esistente o modifica nel popup): vince sempre
  "contratto",          // contratto firmato, in app o caricato
  "preventivo",         // preventivo firmato (classico o modulo edile)
  "computo",
  "offerta",            // offerta di una ditta o di un fornitore
  "sopralluogo",
  "documento",          // capitolato, PDF, foto, piantina, email
  "testo",              // testo libero o vocale trascritto
  "modello",            // modello per tipo di lavoro o regola dell'azienda
  "stima",              // stima di Silvio senza altra base
] as const;
export type TipoFonte = (typeof TIPI_FONTE)[number];

export interface Fonte {
  tipo: TipoFonte;
  /** Id della riga d'origine (quote, bozza di computo, contratto, file caricato…). */
  id?: string | null;
  /** Come la vede l'utente: «preventivo PR-0142», «Contratto.pdf». */
  etichetta: string;
  /** Il punto preciso: «riga 3», «pagina 4». */
  dove?: string | null;
  /** Il testo citato, breve, per la ⓘ. */
  citazione?: string | null;
}

/** Un valore del piano con la sua provenienza. */
export interface Valore<T = unknown> {
  valore: T;
  fonte: Fonte;
  /** 0–1: quanto Silvio è sicuro. Le regole danno 1; le stime meno. */
  fiducia: number;
  stato: Stato;
  /** Perché è in attenzione o in proposta, in italiano semplice. */
  nota?: string | null;
}

/** Due fonti che dicono cose diverse sulla stessa variabile: decide l'utente. */
export interface Conflitto {
  area: Area;
  /** Chiave della variabile nel registro, es. "economia.total_amount". */
  chiave: string;
  candidati: Valore[];
}

/**
 * Il piano: per area, le variabili per chiave (chiavi del registro). Le liste
 * (fasi, rate, persone…) sono un Valore il cui `valore` è un array.
 */
export type PianoCommessa = {
  /** Se c'è, il piano completa una commessa esistente (fase 2) invece di crearne una. */
  orderId?: string | null;
  companyId: string;
  aree: Partial<Record<Area, Record<string, Valore>>>;
  conflitti: Conflitto[];
  fonti: Fonte[];
  /**
   * Avvisi dei lettori e della fusione («chiave sconosciuta…», «pagina 7 illeggibile»),
   * con la fonte davanti. Aggiunto nella fase 0: `fondi` non scarta niente in silenzio.
   */
  avvisi?: string[];
};

/** Quello che un lettore restituisce: pezzi di aree, mai un piano intero. */
export interface Frammento {
  fonte: Fonte;
  aree: Partial<Record<Area, Record<string, Omit<Valore, "fonte"> & { fonte?: Fonte }>>>;
  /** Avvisi del lettore («pagina 7 illeggibile»), da mostrare sulla fonte. */
  avvisi?: string[];
  /** Costo della lettura in euro, 0 per le regole. */
  costoEur?: number;
}

/** Una modifica alla bozza: dal popup a mano o dagli strumenti della chat. */
export type Modifica =
  | { tipo: "cambia_valore"; area: Area; chiave: string; valore: unknown }
  | { tipo: "togli"; area: Area; chiave: string; indice?: number }
  | { tipo: "aggiungi"; area: Area; chiave: string; valore: unknown }
  | { tipo: "sposta_date"; giorniLavorativi: number; daFase?: string | null }
  | { tipo: "scegli_fonte"; area: Area; chiave: string; fonte: TipoFonte; idFonte?: string | null };
