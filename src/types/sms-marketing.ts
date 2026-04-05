/**
 * Tipi TypeScript per il modulo SMS Marketing.
 * Zero any. Tutti i campi nullable tipizzati come string | null.
 */

// ─── Union types ────────────────────────────────────────────

export type SmsContattoStato = "attivo" | "opt_out" | "non_verificato";

export type SmsCampagnaStato =
  | "bozza"
  | "pianificata"
  | "in_corso"
  | "completata"
  | "annullata";

export type SmsCampagnaTipo = "immediata" | "pianificata" | "ricorrente";

export type SmsLogStato =
  | "pending"
  | "inviato"
  | "consegnato"
  | "fallito"
  | "opt_out";

export type SmsTemplateCategoria =
  | "generico"
  | "promozionale"
  | "transazionale"
  | "reminder"
  | "preventivo";

// ─── Entità DB ───────────────────────────────────────────────

/** Mappa 1:1 la tabella sms_contacts */
export interface SmsContatto {
  readonly id: string;
  readonly company_id: string;
  nome: string | null;
  cognome: string | null;
  telefono: string;
  telefono_verified: boolean;
  consenso_marketing: boolean;
  consenso_data: string | null;
  opt_out: boolean;
  opt_out_data: string | null;
  tags: string[];
  note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Form per creazione/modifica contatto */
export interface SmsContattoFormData {
  nome: string;
  cognome: string;
  telefono: string;
  consenso_marketing: boolean;
  tags: string[];
  note: string;
}

/** Mappa 1:1 la tabella sms_campaigns */
export interface SmsCampagna {
  readonly id: string;
  readonly company_id: string;
  nome: string;
  messaggio: string;
  mittente: string;
  stato: SmsCampagnaStato;
  tipo: SmsCampagnaTipo;
  programmata_per: string | null;
  totale_destinatari: number;
  inviati: number;
  consegnati: number;
  errori: number;
  costo_totale: number;
  filtro_tags: string[];
  readonly created_at: string;
  readonly updated_at: string;
}

/** Form per creazione campagna */
export interface SmsCampagnaFormData {
  nome: string;
  messaggio: string;
  mittente: string;
  tipo: SmsCampagnaTipo;
  programmata_per: string | null;
  filtro_tags: string[];
}

/** Mappa 1:1 la tabella sms_log */
export interface SmsLog {
  readonly id: string;
  campagna_id: string | null;
  readonly company_id: string;
  contatto_id: string | null;
  telefono: string;
  messaggio: string;
  stato: SmsLogStato;
  provider_message_id: string | null;
  provider_response: Record<string, unknown> | null;
  costo: number | null;
  errore_dettaglio: string | null;
  inviato_at: string | null;
  consegnato_at: string | null;
  readonly created_at: string;
}

/** Mappa 1:1 la tabella sms_templates */
export interface SmsTemplate {
  readonly id: string;
  readonly company_id: string;
  nome: string;
  categoria: SmsTemplateCategoria;
  messaggio: string;
  variabili: string[];
  attivo: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Form per creazione template */
export interface SmsTemplateFormData {
  nome: string;
  categoria: SmsTemplateCategoria;
  messaggio: string;
  variabili: string[];
  attivo: boolean;
}

/** Aggregati per la dashboard */
export interface SmsStatsDashboard {
  campagneInviate: number;
  smsTotali: number;
  tassoConsegnaMedio: number;
  costoTotale: number;
  trend: SmsTrendPoint[];
  topCampagne: SmsCampagna[];
}

/** Punto dati per il grafico trend mensile */
export interface SmsTrendPoint {
  mese: string; // "2025-01"
  invii: number;
  consegnati: number;
  costo: number;
}

/** Payload per la Edge Function invia-sms */
export interface SmsInvioRequest {
  campagna_id: string;
  company_id: string;
}

/** Risposta della Edge Function invia-sms */
export interface SmsInvioResponse {
  success: boolean;
  inviati: number;
  errori: number;
  error?: string;
}

/** Statistiche per campagna singola */
export interface SmsStatsCampagna {
  inviati: number;
  consegnati: number;
  errori: number;
  tasso_consegna: number;
}
