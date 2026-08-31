export type TicketStatus =
  | "aperto"
  | "in_attesa"
  | "preventivo_da_approvare"
  | "in_attesa_merce"
  | "programmato"
  | "in_lavorazione"
  | "risolto"
  | "chiuso"
  | "annullato";

/**
 * Gli stati dell'assistenza nell'ordine in cui si susseguono davvero, con la
 * frase che spiega quando usarli: l'elenco alimenta i menu a tendina, i filtri
 * e i badge, così non ci sono liste di stati sparse per l'app che divergono
 * (prima "chiuso" e "in_attesa" erano nel tipo ma NON nel database).
 */
export const TICKET_STATI = [
  { value: "aperto", label: "Aperto", desc: "Segnalazione ricevuta, da valutare", tone: "blue", chiuso: false },
  { value: "in_attesa", label: "In attesa", desc: "Fermo: aspettiamo il cliente o una verifica", tone: "amber", chiuso: false },
  { value: "preventivo_da_approvare", label: "Preventivo da approvare", desc: "Intervento a pagamento: il cliente deve accettare", tone: "amber", chiuso: false },
  { value: "in_attesa_merce", label: "In attesa merce", desc: "Ordinato il materiale, si parte quando arriva", tone: "purple", chiuso: false },
  { value: "programmato", label: "Programmato", desc: "Data fissata con il cliente", tone: "indigo", chiuso: false },
  { value: "in_lavorazione", label: "In lavorazione", desc: "Il tecnico ci sta lavorando", tone: "orange", chiuso: false },
  { value: "risolto", label: "Risolto", desc: "Intervento eseguito, resta l'amministrazione", tone: "green", chiuso: true },
  { value: "chiuso", label: "Chiuso", desc: "Chiuso e incassato: niente altro da fare", tone: "slate", chiuso: true },
  { value: "annullato", label: "Annullato", desc: "Non si fa più (rinuncia, doppione, errore)", tone: "slate", chiuso: true },
] as const satisfies ReadonlyArray<{
  value: TicketStatus; label: string; desc: string; tone: string; chiuso: boolean;
}>;

/** Stati che tolgono il ticket dalla coda del lavoro da fare. */
export const TICKET_STATI_CHIUSI: TicketStatus[] = TICKET_STATI.filter(s => s.chiuso).map(s => s.value);

export function ticketStatoLabel(v: string | null | undefined): string {
  return TICKET_STATI.find(s => s.value === v)?.label ?? (v ?? "—");
}

/** Perché un intervento non si fa pagare. */
export const TICKET_MOTIVI_GRATUITO = [
  { value: "garanzia", label: "In garanzia" },
  { value: "cortesia", label: "Cortesia commerciale" },
  { value: "contratto_manutenzione", label: "Compreso nel contratto di manutenzione" },
  { value: "rilavorazione", label: "Rilavorazione nostra" },
] as const;
export type TicketPriority = "bassa" | "normale" | "media" | "alta" | "urgente";
export type TicketTipo = "supporto" | "intervento" | "emergenza";
export type TicketFonte = "ufficio" | "campo" | "cliente" | "api";

/** Priorità ticket selezionabili lato support (sottoinsieme senza "media"). */
export const SUPPORT_PRIORITIES = ["bassa", "normale", "alta", "urgente"] as const;

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
  a_pagamento?: boolean | null;
  motivo_gratuito?: string | null;
  importo_preventivato?: number | null;
  importo_finale?: number | null;
  pagato?: boolean | null;
  data_pagamento?: string | null;
  metodo_pagamento?: string | null;
  note_pagamento?: string | null;
  merce_richiesta?: boolean | null;
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
