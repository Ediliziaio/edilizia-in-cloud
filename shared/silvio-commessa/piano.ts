/**
 * Il piano della commessa che Silvio prepara (31/10/2026): il contratto comune fra lettori,
 * popup, chat, RPC e test. Vedi docs/piano-silvio-commessa-ai.md, sezioni 2 e 5.
 *
 * Solo tipi, nessun codice importato: lo importano il browser (`src/`), le edge function (Deno) e i test.
 * Qui ci sono solo i tipi e i nomi; la fusione (`fondi`), le modifiche (`applica`), il
 * registro delle variabili e il punteggio di completezza stanno accanto, nella fase 0.
 */

import type { CalendarioCantiere } from "./calendario.ts";

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
  /** In ⚠ perché i conti non tornano (quadratura.ts): lo stato e la nota di prima. */
  quadratura?: { stato: Stato; nota: string | null };
  /**
   * Non entra finché una persona non lo conferma, qualunque sia il livello della variabile
   * (revisione 2/11, G18): un importo scritto dalla chat, un elenco su cui le fonti litigavano.
   */
  daConfermare?: boolean;
  /**
   * La persona ci ha messo mano senza confermarlo (revisione 2/11, G5): ha tolto un elemento da
   * una proposta. Resta una proposta, ma nessuna fonte le passa più sopra, e Silvio non la rifà.
   */
  toccato?: boolean;
  /**
   * In «Completa»: il valore che la commessa ha già, quando questo gli aggiunge le colonne che
   * mancano (revisione 2/11, G8). Quelle colonne non si cambiano e non si riscrivono.
   */
  sopraCommessa?: Valore;
  /**
   * Il tipo della fonte da cui viene il valore, dopo che una persona ci ha messo mano (revisione
   * 2/11, terza): spostare le date mette la fonte a `persona`, ma le voci restano quelle del
   * computo. Le voci previste lo leggono per sapere da dove arrivano (`tipoDOrigine`).
   */
  tipoOrigine?: TipoFonte;
  /**
   * Una proposta della chat: il valore che c'era prima, che resta in vigore finché la persona non
   * conferma (`inVigore`), e che «Toglilo» rimette. Null: prima non c'era niente.
   */
  alPostoDi?: Valore | null;
}

/**
 * Il valore che conta adesso: sotto una proposta della chat ancora da confermare, quello di prima.
 * La riga del popup mostra la proposta; la scrittura e i conti leggono questo.
 */
export function inVigore(v: Valore | null | undefined): Valore | undefined {
  if (!v) return undefined;
  if (!v.daConfermare || v.alPostoDi === undefined) return v;
  return v.alPostoDi ?? undefined;
}

/** Il tipo della fonte da cui viene il valore, anche se poi una persona l'ha toccato. */
export function tipoDOrigine(v: Pick<Valore, "fonte" | "tipoOrigine">): TipoFonte {
  return v.tipoOrigine ?? v.fonte.tipo;
}

/** Due fonti che dicono cose diverse sulla stessa variabile: decide l'utente. */
export interface Conflitto {
  area: Area;
  /** Chiave della variabile nel registro, es. "economia.total_amount". */
  chiave: string;
  candidati: Valore[];
  /** Quello che Silvio ha capito del disaccordo (l'imponibile contro l'ivato): decide comunque la persona. */
  nota?: string | null;
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
  /**
   * Il calendario dell'azienda per questo cantiere (fase 5): le date proposte e «sposta»
   * saltano feste, patrono e chiusure. Senza, valgono le feste nazionali. Non si salva:
   * il popup lo rimette a ogni apertura dalle impostazioni.
   */
  calendario?: CalendarioCantiere;
  /**
   * I valori arrivati da un documento mentre la variabile era scritta da una persona
   * (revisione 1/11, L5): non entrano, ma si tengono. Se la persona annulla la sua modifica,
   * tornano nella fusione, e un disaccordo fra le fonti torna un conflitto invece di sparire.
   */
  scartati?: { area: Area; chiave: string; valore: Valore }[];
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
  | {
    tipo: "cambia_valore"; area: Area; chiave: string; valore: unknown;
    /** Da mostrare accanto al valore (l'inizio che cadeva di sabato). */
    nota?: string | null;
    /** Dalla chat, sui campi che contano: resta una proposta da confermare (revisione 2/11, G18). */
    proposta?: boolean;
    /** Una conseguenza di un'altra modifica: il valore cambia, conferma e fonte restano com'erano. */
    conservaStato?: boolean;
  }
  | { tipo: "togli"; area: Area; chiave: string; indice?: number }
  | { tipo: "aggiungi"; area: Area; chiave: string; valore: unknown }
  | { tipo: "sposta_date"; giorniLavorativi: number; daFase?: string | null }
  | {
    tipo: "scegli_fonte"; area: Area; chiave: string; fonte: TipoFonte; idFonte?: string | null;
    /** Senza id, quale documento di quel tipo (revisione 1/11, L1): due capitolati senza id sono due fonti. */
    etichettaFonte?: string | null;
  };

// ── Forma degli elenchi (fase 1, lotto 1.1) ─────────────────────────────────
// I lettori mettono gli elenchi in queste forme; la RPC di creazione (lotto 1.4) le
// legge. Oltre a `name`/`label`, tutti i campi sono facoltativi.
//
// Le variabili con più colonne di `orders` (es. `cliente.contatto`: client_phone e
// client_email) hanno per valore un oggetto con le sole colonne trovate; quelle con
// una colonna sola hanno il valore e basta.

/** Una fase in `fasi.order_work_phases`. Date AAAA-MM-GG. */
export interface FaseDelPiano {
  id?: string | null;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  /** Primo giorno lavorativo della fase dall'inizio dei lavori, da 1. */
  giorno_inizio?: number;
  /** Durata in giorni lavorativi. */
  giorni?: number;
  /** Le voci della fase (dal computo: le voci del capitolo) → `order_work_subphases`. */
  sottofasi?: SottofaseDelPiano[];
}

export interface SottofaseDelPiano {
  name: string;
  quantita?: number | null;
  unita?: string | null;
  /** Venduto della voce, senza IVA. */
  importo?: number | null;
  /** Costo previsto della voce, senza IVA (dal costo stimato o dal listino). */
  costo?: number | null;
  /** Codice di tariffa o del prezzario. */
  codice?: string | null;
}

/** Una rata in `pagamenti.rate` → `order_installments`. */
export interface RataDelPiano {
  label: string;
  type: "deposit" | "balance" | "financing";
  amount: number;
  /** Percentuale sul totale, se la fonte la dice. */
  percent?: number | null;
  /** Evento del cantiere che la rende esigibile (vedi src/lib/orders/rateEventi). */
  trigger_evento?: string | null;
  trigger_numero?: number | null;
  /**
   * L'importo viene da `percent` e il documento non diceva tutto (manca l'IVA o il totale):
   * si rifà quando arriva quello che manca (quadratura.ts). Revisione 2/11, G9 e G20.
   */
  daPercentuale?: boolean;
}

/** Il costo previsto di una fase, in `costi.previsti`. */
export interface CostoDelPiano {
  fase: string;
  /** Costo senza IVA delle voci che ne hanno uno. */
  importo: number;
  /** Voci della fase senza costo: il costo vero è più alto. */
  vociSenzaCosto: number;
}

/**
 * Le condizioni del contratto con il committente, in `economia.condizioni_contratto`
 * (fase 1, lotto 1.2). Le scrive il lettore AI dei contratti; tutti i campi sono
 * facoltativi e ci sono solo quelli che il documento dice.
 */
export interface CondizioniContratto {
  numero_contratto?: string;
  /** Durata dei lavori in giorni naturali e consecutivi, come la scrivono i contratti. */
  durata_giorni?: number;
  /** Penale per ogni giorno di ritardo, in euro… */
  penale_giorno_eur?: number;
  /** …o in per mille dell'importo (gli appalti pubblici la scrivono così). */
  penale_giorno_permille?: number;
  /** Tetto delle penali, in percentuale dell'importo. */
  penale_massima_pct?: number;
  /** Ritenuta di garanzia sui SAL, in percentuale. */
  ritenuta_garanzia_pct?: number;
  anticipo_pct?: number;
  anticipo_eur?: number;
  /** Giorni dalla fattura (o dal SAL) al pagamento. */
  pagamento_giorni?: number;
  subappalto_ammesso?: boolean;
  /** Quota massima subappaltabile, in percentuale. */
  subappalto_massimo_pct?: number;
  garanzia_anni?: number;
  /** Codice identificativo di gara: 10 caratteri. */
  cig?: string;
  /** Codice unico di progetto: 15 caratteri. */
  cup?: string;
  /** Da dove viene ogni campo: le condizioni stanno su pagine diverse del contratto. */
  fonti?: Record<string, { dove: string | null; citazione: string | null }>;
}

/** Il ritmo dei SAL in `sal_scadenze.sal`, quando un contratto lo dice. */
export interface PianoSal {
  /** «mensile», «bimestrale», «a percentuale», o il testo del contratto. */
  cadenza?: string;
  /** Importo minimo di lavori per emettere un SAL. */
  importo_minimo_eur?: number;
  /** Le soglie di avanzamento, se il contratto le elenca (30, 60, 90…). */
  percentuali?: number[];
}
