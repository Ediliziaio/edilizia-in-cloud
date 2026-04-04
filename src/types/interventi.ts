export type TipoIntervento = 'supporto' | 'intervento' | 'emergenza';
export type StatoRapportino = 'bozza' | 'firmato' | 'fatturato';

export interface Intervento {
  id: string;
  company_id: string;
  customer_id: string | null;
  order_id: string | null;
  subject: string;
  status: string;
  priority: string;
  tipo: TipoIntervento;
  indirizzo_intervento: string | null;
  data_intervento_prevista: string | null;
  data_intervento_effettiva: string | null;
  durata_ore: number | null;
  assigned_to: string | null;
  note_tecnico: string | null;
  created_at: string;
  // join fields
  assigned_profile?: { full_name: string | null } | null;
  customer?: { full_name: string | null } | null;
}

export interface MaterialeUsato {
  descrizione: string;
  quantita: number;
  unita: string;
}

export interface RapportinoIntervento {
  id: string;
  company_id: string;
  ticket_id: string;
  tecnico_id: string | null;
  numero: number;
  data_intervento: string;
  descrizione: string;
  ore_lavoro: number;
  materiali_usati: MaterialeUsato[];
  foto_urls: string[];
  firma_cliente: string | null;
  firmato_da: string | null;
  firmato_il: string | null;
  stato: StatoRapportino;
  note: string | null;
  created_at: string;
}

export interface ScortaFurgone {
  id: string;
  company_id: string;
  tecnico_id: string;
  descrizione: string;
  quantita: number;
  quantita_minima: number;
  unita_misura: string;
  created_at: string;
  updated_at: string;
}
