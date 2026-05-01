export type StatoContratto = 'bozza' | 'attivo' | 'completato' | 'risolto' | 'sospeso';
export type StatoSALSub = 'ricevuto' | 'verificato' | 'pagato' | 'contestato';
export type StatoRitenuta = 'trattenuta' | 'svincolata' | 'persa';
export type TipoDocumentoSub =
  | 'durc'
  | 'visura_camerale'
  | 'attestazione_soa'
  | 'dvr'
  | 'polizza_rc'
  | 'iso_certificazione'
  | 'altro';

export interface ContrattoSubappalto {
  id: string;
  company_id: string;
  subappaltatore_id: string;
  order_id: string;
  numero_contratto: string | null;
  descrizione_lavori: string;
  importo_contrattuale: number;
  ritenuta_garanzia_pct: number;
  data_inizio: string | null;
  data_fine_prevista: string | null;
  data_fine_effettiva: string | null;
  stato: StatoContratto;
  note: string | null;
  created_at: string;
}

export interface SALSubappaltatore {
  id: string;
  company_id: string;
  contratto_id: string;
  subappaltatore_id: string;
  order_id: string;
  numero_sal: number;
  data_emissione: string;
  importo_lordo: number;
  ritenuta_pct: number;
  ritenuta_importo: number;
  importo_netto: number;
  stato: StatoSALSub;
  data_pagamento: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  note: string | null;
  attachment_url: string | null;
  created_at: string;
}

export interface RitenutaGaranzia {
  id: string;
  company_id: string;
  contratto_id: string;
  sal_id: string;
  importo: number;
  stato: StatoRitenuta;
  data_svincolo_prevista: string | null;
  data_svincolo_effettiva: string | null;
  note: string | null;
  created_at: string;
}

export interface DocumentoSubappaltatore {
  id: string;
  company_id: string;
  subappaltatore_id: string;
  tipo: TipoDocumentoSub;
  nome_file: string | null;
  url: string;
  data_rilascio: string | null;
  data_scadenza: string | null;
  note: string | null;
  created_at: string;
}

export interface SubappaltatoreBase {
  id: string;
  company_id: string;
  order_id: string | null;
  ragione_sociale: string;
  tipo_lavori: string | null;
  responsabile: string | null;
  telefono: string | null;
  piva: string | null;
  email: string | null;
  pec: string | null;
  indirizzo: string | null;
  note: string | null;
  campo_subappaltatore_id: string | null;
  campo_user_id: string | null;
  campo_user_email: string | null;
  campo_is_active: boolean | null;
  durc_scadenza: string | null;
}

export interface SubappaltatoreConDashboard extends SubappaltatoreBase {
  contratto_id: string | null;
  importo_contrattuale: number;
  ritenuta_garanzia_pct: number | null;
  stato_contratto: StatoContratto | null;
  totale_sal_lordo: number;
  totale_sal_netto: number;
  ritenute_in_corso: number;
  ritenute_svincolate: number;
  residuo_contrattuale: number;
}
