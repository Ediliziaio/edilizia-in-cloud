/**
 * Types per il modulo Computo Metrico → Preventivo AI
 */

export interface ComputoUpload {
  id: string;
  company_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: "pdf" | "xlsx" | "xls" | "xpwe" | "dcf" | "image";
  file_size: number;
  storage_path: string;
  extraction_status: ComputoExtractionStatus;
  extraction_method: "pdf_text" | "pdf_vision" | "xlsx_parse" | "xpwe_parse" | null;
  extraction_confidence: number | null;
  extraction_completed_at: string | null;
  extraction_error: string | null;
  raw_extracted_json: unknown;
  oggetto_lavori: string | null;
  committente: string | null;
  progettista: string | null;
  data_computo: string | null;
  quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ComputoExtractionStatus =
  | "uploading"
  | "extracting_text"
  | "analyzing_ai"
  | "validating"
  | "review"
  | "generating"
  | "completed"
  | "failed";

export interface ComputoVoceEstratta {
  id: string;
  computo_upload_id: string;
  company_id: string;
  capitolo_numero: number | null;
  capitolo_nome: string | null;
  codice_voce: string | null;
  codice_prezzario: string | null;
  descrizione_breve: string;
  descrizione_estesa: string | null;
  unita_misura: string | null;
  quantita: number;
  prezzo_unitario_computo: number;
  importo_computo: number;
  prezzo_unitario_impresa: number | null;
  ricarico_percentuale: number | null;
  sconto_percentuale: number;
  importo_impresa: number | null;
  confidence: number;
  warnings: string[] | null;
  ai_notes: string | null;
  is_included: boolean;
  is_modified: boolean;
  ordine: number;
  created_at: string;
}

/** Local state for the preview editor (non-persisted changes) */
export interface ComputoVoceLocal extends ComputoVoceEstratta {
  _prezzoImpresa: number;
  _ricarico: number;
  _importoImpresa: number;
  _isIncluded: boolean;
  // ── Match al listino aziendale (manual via picker o future auto-match) ──
  /** Article template ID se la voce è abbinata a un articolo del listino. */
  _matched_template_id?: string;
  /** Family ID se la voce è abbinata a una famiglia (configuratore) del listino. */
  _matched_family_id?: string;
  /** Nome del prodotto del listino abbinato (display). */
  _matched_name?: string;
  /** Tipo di match: 'manual' (utente ha cliccato picker), 'auto' (pgvector), 'none'. */
  _match_type?: "manual" | "auto" | "none";
  /** Prezzo unitario suggerito dal listino (override del prezzo computo se l'utente vuole). */
  _matched_unit_price?: number;
}

export interface ComputoConfig {
  clienteId?: string;
  cantiereId?: string;
  prezzarioId?: string;
  ricarico?: number;
  arrotonda?: boolean;
}
