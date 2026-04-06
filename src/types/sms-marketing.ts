/**
 * Tipi TypeScript per il modulo SMS Marketing — Telnyx Reseller.
 * Zero any. Nessun campo '_wholesale' o '_superadmin' in questo file.
 * I tipi SuperAdmin vivono in sms-superadmin.ts separato.
 */

// ─── Union types ────────────────────────────────────────────

export type TelnyxAccountStato = 'in_creazione' | 'attivo' | 'sospeso' | 'terminato';
export type TelnyxNumeroStato  = 'in_acquisto' | 'attivo' | 'sospeso' | 'rilasciato';
export type SmsCampagnaStato   = 'bozza' | 'pianificata' | 'in_corso' | 'completata' | 'annullata';
export type SmsCampagnaTipo    = 'immediata' | 'pianificata';
export type SmsLogStato        = 'pending' | 'inviato' | 'consegnato' | 'fallito' | 'opt_out';
export type SmsWalletTipoMov   = 'ricarica' | 'addebito_sms' | 'addebito_numero' | 'rimborso' | 'bonus';
export type SmsTemplateCategoria = 'generico' | 'promozionale' | 'transazionale' | 'reminder' | 'preventivo';
export type SmsContattoFonte   = 'manuale' | 'csv' | 'crm' | 'api';

// ─── Telnyx Layer ────────────────────────────────────────────

/** Sub-account Telnyx associato all'azienda (senza API key — mai client-side) */
export interface SmsTelnyxAccount {
  readonly id: string;
  readonly company_id: string;
  telnyx_account_id: string;
  stato: TelnyxAccountStato;
  attivato_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Numero +39 dedicato acquistato per l'azienda */
export interface SmsTelnyxNumber {
  readonly id: string;
  readonly company_id: string;
  numero_e164: string;
  numero_display: string;
  prefisso_area: string | null;
  citta: string | null;
  stato: TelnyxNumeroStato;
  costo_mensile_cliente: number;
  data_acquisto: string;
  prossimo_rinnovo: string | null;
}

/** Numero disponibile da acquistare (risultato da telnyx-cerca-numeri) */
export interface TelnyxNumeroDisponibile {
  numero_e164: string;
  numero_display: string;
  prefisso_area: string | null;
  citta: string | null;
  features: string[];
}

// ─── Wallet Layer ────────────────────────────────────────────

/** Wallet crediti prepagati dell'azienda */
export interface SmsWallet {
  readonly id: string;
  readonly company_id: string;
  crediti: number;
  crediti_riservati: number;
  totale_ricaricato: number;
  totale_speso: number;
  ultima_ricarica_at: string | null;
  readonly updated_at: string;
}

/** Singolo movimento crediti (immutabile) */
export interface SmsWalletTransazione {
  readonly id: string;
  readonly company_id: string;
  tipo: SmsWalletTipoMov;
  importo: number;
  saldo_dopo: number;
  descrizione: string;
  riferimento_id: string | null;
  stripe_payment_intent_id: string | null;
  readonly created_at: string;
}

/** Pacchetto crediti acquistabile */
export interface SmsPacchettoCrediti {
  readonly id: string;
  nome: string;
  importo_eur: number;
  crediti_eur: number;
  sms_stimati: number | null;
  bonus_percentuale: number;
  evidenziato: boolean;
  attivo: boolean;
  ordine: number;
}

/** Request per creare un PaymentIntent Stripe */
export interface SmsRicaricaRequest {
  company_id: string;
  pacchetto_id: string;
}

/** Response con client_secret Stripe per il frontend */
export interface SmsRicaricaResponse {
  client_secret: string;
  importo_eur: number;
  crediti_da_accreditare: number;
}

// ─── Provider Config ────────────────────────────────────────

/** Preferenze SMS per-tenant */
export interface SmsProviderConfig {
  readonly id: string;
  readonly company_id: string;
  mittente_display: string | null;
  notifica_soglia_email: boolean;
  notifica_soglia_inapp: boolean;
  onboarding_completato: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

// ─── Contatti ───────────────────────────────────────────────

/** Mappa 1:1 la tabella sms_contacts */
export interface SmsContatto {
  readonly id: string;
  readonly company_id: string;
  nome: string | null;
  cognome: string | null;
  telefono: string;
  telefono_raw?: string | null;
  telefono_verified: boolean;
  consenso_marketing: boolean;
  consenso_data: string | null;
  opt_out: boolean;
  opt_out_data: string | null;
  fonte?: SmsContattoFonte;
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

/** Risultato importazione CSV */
export interface SmsImportResult {
  importati: number;
  aggiornati: number;
  errori: number;
  righe_errore: Array<{ riga: number; motivo: string }>;
}

// ─── Campagne ───────────────────────────────────────────────

/** Mappa 1:1 la tabella sms_campaigns */
export interface SmsCampagna {
  readonly id: string;
  readonly company_id: string;
  nome: string;
  messaggio: string;
  mittente?: string | null;
  stato: SmsCampagnaStato;
  tipo: SmsCampagnaTipo;
  programmata_per: string | null;
  totale_destinatari: number;
  inviati: number;
  consegnati: number;
  errori: number;
  costo_totale: number;
  parti_sms: number;
  costo_per_sms_snapshot: number;
  costo_totale_cliente: number;
  filtro_tags: string[];
  readonly created_at: string;
  readonly updated_at: string;
}

/** Form per creazione campagna */
export interface SmsCampagnaFormData {
  nome: string;
  messaggio: string;
  tipo: SmsCampagnaTipo;
  programmata_per: string | null;
  filtro_tags: string[];
}

// ─── Log SMS ────────────────────────────────────────────────

/** Mappa 1:1 la tabella sms_log */
export interface SmsLog {
  readonly id: string;
  campagna_id: string | null;
  readonly company_id: string;
  contatto_id: string | null;
  telefono: string;
  messaggio: string;
  parti_sms: number;
  stato: SmsLogStato;
  telnyx_message_id: string | null;
  costo_cliente: number | null;
  errore_dettaglio: string | null;
  inviato_at: string | null;
  consegnato_at: string | null;
  readonly created_at: string;
}

// ─── Template ───────────────────────────────────────────────

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
}

/** Form per creazione template */
export interface SmsTemplateFormData {
  nome: string;
  categoria: SmsTemplateCategoria;
  messaggio: string;
  variabili: string[];
  attivo: boolean;
}

// ─── Dashboard ──────────────────────────────────────────────

/** Aggregati per la dashboard SMS */
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
  mese: string;
  invii: number;
  consegnati: number;
  costo: number;
}

/** Statistiche per campagna singola */
export interface SmsStatsCampagna {
  inviati: number;
  consegnati: number;
  errori: number;
  tasso_consegna: number;
  costo_totale_cliente: number;
}

// ─── Edge Function I/O ──────────────────────────────────────

export interface TelnyxAttivaRequest  { company_id: string }
export interface TelnyxAttivaResponse { success: boolean; telnyx_account_id: string }

export interface TelnyxCercaNumeriRequest {
  company_id: string;
  prefisso_area?: string;
  citta?: string;
}
export interface TelnyxCercaNumeriResponse { numeri: TelnyxNumeroDisponibile[] }

export interface TelnyxAcquistaNumeroRequest  { company_id: string; numero_e164: string }
export interface TelnyxAcquistaNumeroResponse {
  success: boolean;
  numero_e164: string;
  numero_display: string;
  prossimo_rinnovo: string;
}

export interface TelnyxInviaSmsRequest  { campagna_id: string; company_id: string }
export interface TelnyxInviaSmsResponse {
  success: boolean;
  inviati: number;
  errori: number;
  costo_totale: number;
  crediti_residui: number;
  error?: string;
}

export interface TelnyxTestInvioRequest {
  company_id: string;
  telefono_destinatario: string;
  messaggio_test: string;
}
export interface TelnyxTestInvioResponse {
  success: boolean;
  telnyx_message_id: string | null;
  costo_addebitato: number;
  error?: string;
}

/** @deprecated Usa TelnyxInviaSmsResponse */
export interface SmsInvioRequest  { campagna_id: string; company_id: string }
/** @deprecated Usa TelnyxInviaSmsResponse */
export interface SmsInvioResponse { success: boolean; inviati: number; errori: number; error?: string }
