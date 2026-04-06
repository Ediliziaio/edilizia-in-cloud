// FEA (Firma Elettronica Avanzata) + Gestione Documenti Personalizzati — Tipi TypeScript

export type FEATipoDocumento = 'order' | 'quote' | 'sessione' | 'odv';

export type FEATipoFirmatario = 'b2b' | 'b2c';

export type FEAStato =
  | 'pending'
  | 'otp_verified'
  | 'signed'
  | 'refused'
  | 'expired'
  | 'cancelled';

export type DocumentoTipo =
  | 'generico'
  | 'contratto'
  | 'verbale'
  | 'accettazione'
  | 'modulo'
  | 'preventivo'
  | 'sal'
  | 'ddt'
  | 'variante';

export type FieldTipo =
  | 'testo'
  | 'numero'
  | 'data'
  | 'valuta'
  | 'scelta'
  | 'email'
  | 'telefono';

export interface DocumentoTemplate {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  tipo_doc: DocumentoTipo;
  file_url: string;
  file_type: 'pdf' | 'docx';
  file_size: number | null;
  anteprima_url: string | null;
  attivo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // join
  campi?: DocumentoTemplateField[];
}

export interface DocumentoTemplateField {
  id: string;
  template_id: string;
  company_id: string;
  nome: string;
  etichetta: string;
  tipo: FieldTipo;
  segnaposto: string;
  opzioni_scelta: string[] | null;
  obbligatorio: boolean;
  valore_default: string | null;
  ordinamento: number;
  created_at: string;
}

export interface DocumentoSessione {
  id: string;
  company_id: string;
  template_id: string;
  nome: string;
  valori_campi: Record<string, string>;
  pdf_url: string | null;
  pdf_hash: string | null;
  stato: 'bozza' | 'generato' | 'in_firma' | 'firmato' | 'archiviato';
  order_id: string | null;
  quote_id: string | null;
  contact_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // join
  template?: { nome: string; tipo_doc: DocumentoTipo };
}

export interface FEASignatureRequest {
  id: string;
  company_id: string;
  order_id: string | null;
  token: string;
  signer_email: string;
  signer_name: string;
  status: FEAStato;
  signature_data: string | null;
  signed_at: string | null;
  signed_by_ip: string | null;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // FEA fields
  tipo_documento: FEATipoDocumento | null;
  sessione_id: string | null;
  tipo_firmatario: FEATipoFirmatario;
  otp_hash: string | null;
  otp_scadenza: string | null;
  otp_tentativi: number;
  documento_hash: string | null;
  certificato_url: string | null;
  firma_ip: string | null;
  firma_user_agent: string | null;
  firma_lat: number | null;
  firma_lng: number | null;
  b2c_recesso: boolean | null;
  b2c_recesso_ts: string | null;
  b2c_clausole: string[] | null;
  b2c_email_copia: boolean;
  rifiuto_motivo: string | null;
}

export interface FEAAuditLog {
  id: string;
  request_id: string;
  company_id: string;
  evento:
    | 'sessione_creata'
    | 'link_inviato'
    | 'link_aperto'
    | 'otp_inviato'
    | 'otp_verificato'
    | 'otp_fallito'
    | 'documento_visualizzato'
    | 'recesso_accettato'
    | 'clausola_approvata'
    | 'firma_completata'
    | 'firma_rifiutata'
    | 'certificato_generato'
    | 'email_copia_inviata'
    | 'sessione_scaduta';
  ip: string | null;
  user_agent: string | null;
  lat: number | null;
  lng: number | null;
  metadati: Record<string, unknown> | null;
  created_at: string;
}

export interface FEAConfigurazione {
  id: string;
  company_id: string;
  addon_attivo: boolean;
  testo_recesso_b2c: string | null;
  clausole_vess: FEAClausolaVessatoria[];
  created_at: string;
  updated_at: string;
}

export interface FEAClausolaVessatoria {
  id: string;
  testo: string;
  obbligatoria?: boolean;
}

export interface FEARichiediDTO {
  tipo_documento: FEATipoDocumento;
  documento_id: string;
  tipo_firmatario: FEATipoFirmatario;
  signer_email: string;
  signer_name: string;
  expires_giorni?: number;
}

export interface FEASessionePubblica {
  request_id: string;
  tipo_documento: FEATipoDocumento;
  tipo_firmatario: FEATipoFirmatario;
  signer_name: string;
  azienda_nome: string;
  documento_titolo: string;
  pdf_url: string | null;
  status: FEAStato;
  expires_at: string;
  signed_at?: string | null;
  b2c_testo_recesso: string | null;
  b2c_clausole: FEAClausolaVessatoria[] | null;
}
