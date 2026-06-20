/**
 * Tipi della Libreria Prezzari Regionali (condivisa, read-only per le aziende).
 * Hand-written, indipendenti dai tipi Supabase generati (le tabelle vengono
 * applicate via MCP in pubblicazione). Contratto per import/queries/UI.
 * Vedi docs/superpowers/specs/2026-06-20-prezzari-regionali-design.md
 */

export type StatoFonte = "bozza" | "pubblicato" | "archiviato";

export type QualificaManodopera =
  | "comune"
  | "qualificato"
  | "specializzato"
  | "quarto_livello";

/** Una fonte = un prezzario regionale, versionato per anno. */
export interface PrezzarioFonte {
  id: string;
  regione: string;
  anno: number;
  versione: string | null;
  nome: string;
  url_fonte: string | null;
  licenza: string | null;
  stato: StatoFonte;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Capitolo gerarchico (capitolo → sotto-capitolo) di una fonte. */
export interface PrezzarioCapitolo {
  id: string;
  fonte_id: string;
  codice: string | null;
  titolo: string;
  parent_id: string | null;
  livello: number;
  ordine: number;
}

/** Voce/articolo del prezzario. `prezzo` è la base; il margine si applica in adozione. */
export interface PrezzarioVoce {
  id: string;
  fonte_id: string;
  capitolo_id: string | null;
  codice: string | null;
  descrizione: string;
  unita_misura: string | null;
  prezzo: number;
  /** Incidenza manodopera 0..1 (obbligo base d'asta). */
  incidenza_manodopera_pct: number | null;
  /** Incidenza oneri sicurezza 0..1 (se presente). */
  incidenza_sicurezza_pct: number | null;
  note: string | null;
  ordine: number;
}

/** Tariffa oraria manodopera edile ufficiale (popolata in v2). */
export interface ManodoperaTariffa {
  id: string;
  regione: string | null;
  provincia: string | null;
  anno: number | null;
  qualifica: QualificaManodopera | null;
  costo_orario: number | null;
  fonte: string | null;
  created_at: string;
}

/** Unità di misura canoniche del prezzario (superset di quelle del listino). */
export const PREZZARIO_UM_VALUES = [
  "cad", "mq", "mc", "ml", "kg", "h", "t", "l", "a_corpo",
] as const;
export type PrezzarioUM = (typeof PREZZARIO_UM_VALUES)[number];

/** Regioni + province autonome (per i preset adapter e la UI). */
export const REGIONI_ITALIANE = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino — P.A. Trento", "Trentino — P.A. Bolzano", "Umbria",
  "Valle d'Aosta", "Veneto",
] as const;
export type RegioneItaliana = (typeof REGIONI_ITALIANE)[number];
