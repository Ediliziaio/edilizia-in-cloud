export type TicketStatus = "aperto" | "in_lavorazione" | "risolto" | "chiuso" | "in_attesa";
export type TicketPriority = "bassa" | "normale" | "media" | "alta" | "urgente";
export type TicketTipo = "supporto" | "intervento" | "emergenza";
export type TicketFonte = "ufficio" | "campo" | "cliente" | "api";

export interface TicketMessage {
  id: string;
  message: string;
  sender_id: string;
  created_at: string;
  attachment_url?: string | null;
  sender?: {
    first_name: string;
    last_name: string;
  } | null;
}

export interface TicketListItem {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  tipo?: TicketTipo | string | null;
  fonte?: TicketFonte | string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  order_id: string | null;
  impianto_id?: string | null;
  assigned_to: string | null;
  category: string | null;
  data_intervento_prevista?: string | null;
  data_intervento_effettiva?: string | null;
  indirizzo_intervento?: string | null;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  order?: {
    description: string;
  } | null;
  assignee?: {
    first_name: string;
    last_name: string;
  } | null;
}

export interface TicketDetail {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  tipo?: TicketTipo | string | null;
  fonte?: TicketFonte | string | null;
  created_at: string;
  customer_id: string;
  order_id: string | null;
  impianto_id?: string | null;
  assigned_to: string | null;
  category: string | null;
  internal_notes: string | null;
  /** Campi "intervento" — erano esclusivi di InterventiDetail, ora qui per unificazione. */
  data_intervento_prevista?: string | null;
  data_intervento_effettiva?: string | null;
  indirizzo_intervento?: string | null;
  durata_ore?: number | null;
  note_tecnico?: string | null;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  order?: {
    id: string;
    description: string;
  } | null;
}

export interface CustomerTicketListItem {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  order?: {
    description: string;
  } | null;
}

export interface CustomerTicketDetail {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  order_id: string | null;
  order?: {
    id: string;
    description: string;
  } | null;
}
