/**
 * Tipi del modulo Finanziamenti — Phase A.
 *
 * Modello dati derivato dalla tabella reale Fiditalia OKNOPLAST TAN 8.75
 * (cond. 255891). 14 colonne per riga di lookup importo × durata.
 */

export interface Finanziaria {
  id: string;
  company_id: string;
  nome: string;
  ragione_sociale: string | null;
  partita_iva: string | null;
  logo_url: string | null;
  email_pratiche: string | null;
  telefono: string | null;
  note: string | null;
  attiva: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TabellaFinanziamento {
  id: string;
  company_id: string;
  finanziaria_id: string;
  nome_prodotto: string;
  codice_condizione: string | null;
  subtariffa_default: string | null;
  tan_base: number | null;
  pdf_url: string | null;
  pdf_filename: string | null;
  csv_url: string | null;
  csv_filename: string | null;
  data_decorrenza: string | null;
  data_scadenza: string | null;
  attiva: boolean;
  note: string | null;
  righe_count: number;
  importo_min: number | null;
  importo_max: number | null;
  durate_disponibili: number[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RigaTabellaFinanziamento {
  id: string;
  tabella_id: string;
  company_id: string;
  subtariffa: string | null;
  importo_erogato: number;
  spese_istruttoria: number;
  importo_totale_credito: number;
  numero_rate: number;
  durata_mesi: number;
  prima_rata_giorni: number;
  importo_rata: number;
  spese_incasso_rata: number;
  interessi_cliente: number;
  importo_totale_dovuto: number;
  tan: number;
  taeg: number;
  icc: number | null;
  provvigione_dealer: number;
  created_at: string;
}

/** Risultato del calcolatore finanziamento (lookup + eventuale interpolazione). */
export interface RisultatoCalcolo {
  /** Importo richiesto dall'utente (potrebbe non corrispondere a una riga esatta). */
  importo_richiesto: number;
  numero_rate: number;
  /** Modalità con cui il risultato è stato ottenuto. */
  modalita: "esatto" | "interpolato" | "errore";
  /** Codice di errore (popolato solo se modalita = "errore"). */
  errore?:
    | "durata_non_disponibile"
    | "importo_fuori_range"
    | "tabella_vuota"
    | "tabella_non_trovata";
  /** Messaggio human-readable in italiano. */
  messaggio?: string;
  /** Durate disponibili nella tabella (per suggerimento UI). */
  durate_disponibili?: number[];
  /** Range importi della tabella (per suggerimento UI). */
  importo_min?: number;
  importo_max?: number;
  // ─── Risultato (popolato solo se modalita = "esatto" o "interpolato") ───
  importo_rata?: number;
  spese_incasso_rata?: number;
  rata_completa?: number;
  spese_istruttoria?: number;
  importo_totale_credito?: number;
  interessi_cliente?: number;
  importo_totale_dovuto?: number;
  tan?: number;
  taeg?: number;
  icc?: number | null;
  provvigione_dealer?: number;
  /** Riga di base usata per il calcolo (utile per debug). */
  riga_base?: RigaTabellaFinanziamento;
  /** Se interpolato, le 2 righe ai bordi. */
  righe_interpolazione?: {
    sotto: RigaTabellaFinanziamento;
    sopra: RigaTabellaFinanziamento;
    fattore: number;
  };
}

/** Errore durante il parsing di una riga CSV. */
export interface ErroreImportRiga {
  riga: number;
  colonna?: string;
  messaggio: string;
}

export interface RisultatoImportCsv {
  righe_valide: Array<Omit<RigaTabellaFinanziamento, "id" | "tabella_id" | "company_id" | "created_at">>;
  errori: ErroreImportRiga[];
}
