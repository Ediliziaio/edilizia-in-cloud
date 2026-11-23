import type { Programmazione } from "./programmata";

export type ModoImport = "create" | "update" | "upsert";

export interface AutomazioneScelta { id: string; nome: string }

export interface OpzioniImport {
  mode: ModoImport;
  etichette?: string[];
  automazioni?: AutomazioneScelta[];
  /** A scaglioni sul server invece che subito. */
  programmazione?: Programmazione | null;
  nomeFile?: string;
}

/** Una riga del file da guardare: il numero è quello del file (con l'intestazione è la riga 1). */
export interface RigaDaRivedere { riga: number; motivo: string }

/** Com'è andata: i numeri, cosa è stato fatto dopo, e le righe da guardare. */
export interface EsitoImportazione {
  success: number;
  /** Righe non importate per un errore. */
  errors: string[];
  creati?: number;
  aggiornati?: number;
  saltati?: number;
  /** Righe non importate di proposito (doppie nel file): da controllare, non errori. */
  avvisi?: string[];
  /** Cosa è stato fatto dopo l'importazione: etichette, automazioni. */
  fatto?: string[];
  /** Cosa non è riuscito dopo l'importazione (le righe sono entrate lo stesso). */
  nonRiuscito?: string[];
  /** Le righe non importate, per scaricarle e correggerle. */
  righeDaRivedere?: RigaDaRivedere[];
  /** Importazione messa in coda a scaglioni. */
  programmata?: { totale: number; descrizione: string; fine: string | null };
}

/** Cosa succederà premendo «Importa»: si calcola prima, senza scrivere niente. */
export interface AnteprimaImport {
  righe: number;
  nuovi: number;
  aggiornati: number;
  saltati: number;
  doppi: number;
  nonValide: number;
  senzaContatto: number;
}

/** Il numero di riga nel file: lo mette il wizard, altrimenti si conta dall'ordine. */
export const numeroRiga = (r: Record<string, string>, indice: number) => Number(r.__riga) || indice + 2;
