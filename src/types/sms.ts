/**
 * @file sms.ts
 * @description Tipi TypeScript per il modulo SMS Transazionale (messaggi individuali + automazioni).
 *              Separato da sms-marketing.ts che gestisce le campagne bulk.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

// ─── Enums ────────────────────────────────────────────────────

export type SmsDirection = 'outbound' | 'inbound';

export type SmsStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'received';

export type SmsTriggerType = 'manual' | 'automation' | 'api';

export type SmsTriggerEntity =
  | 'preventivo'
  | 'cantiere'
  | 'fattura'
  | 'intervento'
  | 'documento';

export type SmsAutomationEvento =
  | 'preventivo_firmato'
  | 'preventivo_inviato'
  | 'fattura_scaduta'
  | 'cantiere_iniziato'
  | 'cantiere_completato'
  | 'intervento_programmato'
  | 'documento_caricato'
  | 'pagamento_ricevuto';

export type SmsTipoDestinatario = 'cliente' | 'tecnico' | 'custom_number';

export type SmsAutomationLogStatus = 'sent' | 'failed' | 'skipped';

// ─── Entità DB ────────────────────────────────────────────────

export interface SmsMessage {
  id: string;
  company_id: string;
  direction: SmsDirection;
  status: SmsStatus;
  to_number: string;
  from_number: string;
  body: string;
  telnyx_id: string | null;
  trigger_type: SmsTriggerType | null;
  trigger_ref: string | null;
  trigger_entity: SmsTriggerEntity | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsAutomation {
  id: string;
  company_id: string;
  nome: string;
  descrizione: string | null;
  trigger_evento: SmsAutomationEvento;
  delay_minuti: number;
  template_body: string;
  tipo_destinatario: SmsTipoDestinatario;
  numero_custom: string | null;
  attiva: boolean;
  contatore_invii: number;
  ultima_esecuzione: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsAutomationLog {
  id: string;
  automation_id: string;
  company_id: string;
  sms_message_id: string | null;
  trigger_ref: string | null;
  trigger_entity: string | null;
  status: SmsAutomationLogStatus;
  error_message: string | null;
  eseguita_at: string;
}

// ─── Form data ────────────────────────────────────────────────

export interface SmsComposeFormData {
  to_number: string;
  body: string;
  trigger_entity?: SmsTriggerEntity;
  trigger_ref?: string;
}

export interface SmsAutomationFormData {
  nome: string;
  descrizione?: string;
  trigger_evento: SmsAutomationEvento;
  delay_minuti: number;
  template_body: string;
  tipo_destinatario: SmsTipoDestinatario;
  numero_custom?: string;
  attiva: boolean;
}

// ─── Filtri ───────────────────────────────────────────────────

export interface SmsMessageFiltri {
  status?: SmsStatus;
  direction?: SmsDirection;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// ─── KPI / Stats ──────────────────────────────────────────────

export interface SmsStats {
  totaleInviati: number;
  totaleConsegnati: number;
  totaleRicevuti: number;
  totaleFalliti: number;
  tassoConsegna: number;         // percentuale 0–100
  tassoConsegnaPrecedente: number;
  inviatoOggi: number;
  inviatoSettimana: number;
}

// ─── Edge Function I/O ────────────────────────────────────────

export interface TelnyxSendSmsRequest {
  to_number: string;
  body: string;
  company_id: string;
  trigger_type?: SmsTriggerType;
  trigger_entity?: SmsTriggerEntity;
  trigger_ref?: string;
}

export interface TelnyxSendSmsResponse {
  ok: boolean;
  message_id?: string;
  telnyx_id?: string;
  error?: string;
}

export interface SmsAutomationRunnerRequest {
  evento: SmsAutomationEvento;
  company_id: string;
  trigger_ref?: string;
  trigger_entity?: SmsTriggerEntity;
  variabili?: Record<string, string>;
}

export interface SmsAutomationRunnerResponse {
  ok: boolean;
  inviate: number;
  saltate: number;
  errori: number;
}

// ─── Etichette UI ─────────────────────────────────────────────

export const SMS_STATUS_LABELS: Record<SmsStatus, string> = {
  queued:    'In coda',
  sending:   'In invio',
  sent:      'Inviato',
  delivered: 'Consegnato',
  failed:    'Fallito',
  received:  'Ricevuto',
};

export const SMS_AUTOMATION_EVENTO_LABELS: Record<SmsAutomationEvento, string> = {
  preventivo_firmato:     'Preventivo firmato',
  preventivo_inviato:     'Preventivo inviato',
  fattura_scaduta:        'Fattura scaduta',
  cantiere_iniziato:      'Cantiere avviato',
  cantiere_completato:    'Cantiere completato',
  intervento_programmato: 'Intervento programmato',
  documento_caricato:     'Documento caricato',
  pagamento_ricevuto:     'Pagamento ricevuto',
};

export const SMS_DESTINATARIO_LABELS: Record<SmsTipoDestinatario, string> = {
  cliente:       'Cliente',
  tecnico:       'Tecnico',
  custom_number: 'Numero personalizzato',
};
