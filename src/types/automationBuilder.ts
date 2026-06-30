export interface AutomationFlow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  version: number;
  folder_id: string | null;
  config_json: Record<string, any> | null;
  category: string;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationNode {
  id: string;
  flow_id: string;
  company_id: string;
  node_type: "trigger" | "action" | "condition" | "delay" | "goal" | "split";
  position_x: number;
  position_y: number;
  config_json: Record<string, any>;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationConnection {
  id: string;
  flow_id: string;
  company_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
  created_at: string;
}

// ── Trigger Condition Builder Types ──

export interface TriggerCondition {
  id: string;
  field: string;
  operator: string;
  value: any;
  negate?: boolean;
}

export interface TriggerConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: (TriggerCondition | TriggerConditionGroup)[];
}

export interface TriggerFilters {
  logic: "AND" | "OR";
  conditions: (TriggerCondition | TriggerConditionGroup)[];
}

export function isConditionGroup(c: TriggerCondition | TriggerConditionGroup): c is TriggerConditionGroup {
  return "logic" in c && "conditions" in c;
}

// ── Field / Operator definitions ──

export type FieldType = "text" | "number" | "date" | "select" | "tags" | "user" | "boolean";

export interface TriggerFieldDef {
  key: string;
  label: string;
  type: FieldType;
  group: string;
  options?: { value: string; label: string }[];
}

export interface OperatorDef {
  value: string;
  label: string;
  needsValue: boolean;
}

export const TEXT_OPERATORS: OperatorDef[] = [
  { value: "equals", label: "Uguale a", needsValue: true },
  { value: "not_equals", label: "Diverso da", needsValue: true },
  { value: "contains", label: "Contiene", needsValue: true },
  { value: "not_contains", label: "Non contiene", needsValue: true },
  { value: "starts_with", label: "Inizia con", needsValue: true },
  { value: "ends_with", label: "Termina con", needsValue: true },
  { value: "is_empty", label: "È vuoto", needsValue: false },
  { value: "is_not_empty", label: "Non è vuoto", needsValue: false },
];

export const NUMBER_OPERATORS: OperatorDef[] = [
  { value: "equals", label: "=", needsValue: true },
  { value: "not_equals", label: "≠", needsValue: true },
  { value: "gt", label: ">", needsValue: true },
  { value: "gte", label: "≥", needsValue: true },
  { value: "lt", label: "<", needsValue: true },
  { value: "lte", label: "≤", needsValue: true },
  { value: "between", label: "Tra", needsValue: true },
];

export const DATE_OPERATORS: OperatorDef[] = [
  { value: "on", label: "Il giorno", needsValue: true },
  { value: "before", label: "Prima di", needsValue: true },
  { value: "after", label: "Dopo il", needsValue: true },
  { value: "between", label: "Tra", needsValue: true },
  { value: "today", label: "Oggi", needsValue: false },
  { value: "yesterday", label: "Ieri", needsValue: false },
  { value: "in_last_x_days", label: "Negli ultimi X giorni", needsValue: true },
  { value: "in_next_x_days", label: "Nei prossimi X giorni", needsValue: true },
  { value: "is_empty", label: "È vuoto", needsValue: false },
  { value: "is_not_empty", label: "Non è vuoto", needsValue: false },
];

export const BOOLEAN_OPERATORS: OperatorDef[] = [
  { value: "is_true", label: "Vero", needsValue: false },
  { value: "is_false", label: "Falso", needsValue: false },
];

export const TAG_OPERATORS: OperatorDef[] = [
  { value: "contains", label: "Contiene", needsValue: true },
  { value: "not_contains", label: "Non contiene", needsValue: true },
];

export const USER_OPERATORS: OperatorDef[] = [
  { value: "equals", label: "Uguale a", needsValue: true },
  { value: "not_equals", label: "Diverso da", needsValue: true },
  { value: "is_assigned", label: "È assegnato", needsValue: false },
  { value: "is_not_assigned", label: "Non è assegnato", needsValue: false },
];

export const SELECT_OPERATORS: OperatorDef[] = [
  { value: "equals", label: "Uguale a", needsValue: true },
  { value: "not_equals", label: "Diverso da", needsValue: true },
  { value: "is_empty", label: "È vuoto", needsValue: false },
  { value: "is_not_empty", label: "Non è vuoto", needsValue: false },
];

export function getOperatorsForType(type: FieldType): OperatorDef[] {
  switch (type) {
    case "text": return TEXT_OPERATORS;
    case "number": return NUMBER_OPERATORS;
    case "date": return DATE_OPERATORS;
    case "boolean": return BOOLEAN_OPERATORS;
    case "tags": return TAG_OPERATORS;
    case "user": return USER_OPERATORS;
    case "select": return SELECT_OPERATORS;
    default: return TEXT_OPERATORS;
  }
}

// ── Field definitions per trigger category ──

export const CONTACT_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "email", label: "Email", type: "text", group: "Campi standard" },
  { key: "phone", label: "Telefono", type: "text", group: "Campi standard" },
  { key: "contact_type", label: "Tipo contatto", type: "select", group: "Campi standard", options: [{ value: "lead", label: "Lead" }, { value: "cliente", label: "Cliente" }, { value: "prospect", label: "Prospect" }] },
  { key: "tags", label: "Tag", type: "tags", group: "Campi standard" },
  { key: "source", label: "Fonte Lead", type: "text", group: "Campi standard" },
  { key: "city", label: "Città", type: "text", group: "Località" },
  { key: "province", label: "Provincia (sigla)", type: "text", group: "Località" },
  { key: "region", label: "Regione", type: "select", group: "Località", options: [
    { value: "Abruzzo", label: "Abruzzo" }, { value: "Basilicata", label: "Basilicata" },
    { value: "Calabria", label: "Calabria" }, { value: "Campania", label: "Campania" },
    { value: "Emilia-Romagna", label: "Emilia-Romagna" }, { value: "Friuli-Venezia Giulia", label: "Friuli-Venezia Giulia" },
    { value: "Lazio", label: "Lazio" }, { value: "Liguria", label: "Liguria" },
    { value: "Lombardia", label: "Lombardia" }, { value: "Marche", label: "Marche" },
    { value: "Molise", label: "Molise" }, { value: "Piemonte", label: "Piemonte" },
    { value: "Puglia", label: "Puglia" }, { value: "Sardegna", label: "Sardegna" },
    { value: "Sicilia", label: "Sicilia" }, { value: "Toscana", label: "Toscana" },
    { value: "Trentino-Alto Adige", label: "Trentino-Alto Adige" }, { value: "Umbria", label: "Umbria" },
    { value: "Valle d'Aosta", label: "Valle d'Aosta" }, { value: "Veneto", label: "Veneto" },
  ] },
  { key: "dnd_status", label: "Stato DND", type: "boolean", group: "Campi standard" },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Campi standard" },
  { key: "created_at", label: "Data creazione", type: "date", group: "Campi standard" },
];

export const OPPORTUNITY_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "pipeline", label: "Pipeline", type: "select", group: "Opportunità" },
  { key: "stage", label: "Fase", type: "select", group: "Opportunità" },
  { key: "value", label: "Valore opportunità", type: "number", group: "Opportunità" },
  { key: "status", label: "Stato", type: "select", group: "Opportunità", options: [{ value: "open", label: "Aperta" }, { value: "won", label: "Vinta" }, { value: "lost", label: "Persa" }] },
  { key: "created_at", label: "Data creazione", type: "date", group: "Opportunità" },
  { key: "closed_at", label: "Data chiusura", type: "date", group: "Opportunità" },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Opportunità" },
  { key: "tags", label: "Tag", type: "tags", group: "Opportunità" },
];

export const APPOINTMENT_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "calendar", label: "Calendario", type: "select", group: "Appuntamento" },
  { key: "status", label: "Stato appuntamento", type: "select", group: "Appuntamento", options: [{ value: "confirmed", label: "Confermato" }, { value: "pending", label: "In attesa" }, { value: "cancelled", label: "Cancellato" }, { value: "completed", label: "Completato" }] },
  { key: "appointment_date", label: "Data appuntamento", type: "date", group: "Appuntamento" },
  { key: "appointment_type", label: "Tipo appuntamento", type: "select", group: "Appuntamento", options: [{ value: "visita", label: "Visita" }, { value: "call", label: "Chiamata" }, { value: "meeting", label: "Meeting" }] },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Appuntamento" },
  { key: "source", label: "Fonte prenotazione", type: "text", group: "Appuntamento" },
];

export const COMMUNICATION_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "comm_type", label: "Tipo comunicazione", type: "select", group: "Comunicazione", options: [{ value: "email_opened", label: "Email aperta" }, { value: "email_clicked", label: "Email cliccata" }, { value: "email_not_opened", label: "Email non aperta" }, { value: "whatsapp_received", label: "WhatsApp ricevuto" }, { value: "whatsapp_not_replied", label: "WhatsApp non risposto" }, { value: "call_completed", label: "Chiamata completata" }, { value: "call_missed", label: "Chiamata persa" }] },
  { key: "link_clicked", label: "Link specifico", type: "text", group: "Comunicazione" },
  { key: "reply_time", label: "Tempo risposta (min)", type: "number", group: "Comunicazione" },
  { key: "call_duration", label: "Durata chiamata (sec)", type: "number", group: "Comunicazione" },
  { key: "call_outcome", label: "Esito chiamata", type: "select", group: "Comunicazione", options: [{ value: "answered", label: "Risposta" }, { value: "no_answer", label: "Senza risposta" }, { value: "busy", label: "Occupato" }, { value: "voicemail", label: "Segreteria" }] },
];

export const SYSTEM_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "webhook_url", label: "Webhook URL", type: "text", group: "Sistema" },
  { key: "form_id", label: "Form ID", type: "text", group: "Sistema" },
  { key: "survey_id", label: "Survey ID", type: "text", group: "Sistema" },
];

export const SOCIAL_MEDIA_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "form_id", label: "Form ID", type: "text", group: "Facebook" },
  { key: "campaign_name", label: "Nome campagna", type: "text", group: "Facebook" },
  { key: "is_new_contact", label: "Nuovo contatto", type: "boolean", group: "Facebook" },
  { key: "source", label: "Fonte", type: "text", group: "Facebook" },
  { key: "tags", label: "Tag", type: "tags", group: "Contatto" },
];

export const ORDER_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "order_number", label: "Numero ordine", type: "text", group: "Ordine" },
  { key: "status", label: "Stato ordine", type: "select", group: "Ordine", options: [{ value: "nuovo", label: "Nuovo" }, { value: "in_lavorazione", label: "In lavorazione" }, { value: "spedito", label: "Spedito" }, { value: "consegnato", label: "Consegnato" }, { value: "annullato", label: "Annullato" }] },
  { key: "total_amount", label: "Importo totale", type: "number", group: "Ordine" },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Ordine" },
  { key: "created_at", label: "Data creazione", type: "date", group: "Ordine" },
  { key: "delivery_date", label: "Data consegna prevista", type: "date", group: "Ordine" },
  { key: "tags", label: "Tag", type: "tags", group: "Ordine" },
  { key: "client_name", label: "Nome cliente", type: "text", group: "Ordine" },
];

export const INVOICE_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "invoice_number", label: "Numero fattura", type: "text", group: "Fattura" },
  { key: "status", label: "Stato", type: "select", group: "Fattura", options: [{ value: "emessa", label: "Emessa" }, { value: "pagata", label: "Pagata" }, { value: "scaduta", label: "Scaduta" }, { value: "annullata", label: "Annullata" }] },
  { key: "total_amount", label: "Importo", type: "number", group: "Fattura" },
  { key: "due_date", label: "Data scadenza", type: "date", group: "Fattura" },
  { key: "created_at", label: "Data emissione", type: "date", group: "Fattura" },
  { key: "client_name", label: "Nome cliente", type: "text", group: "Fattura" },
  { key: "payment_method", label: "Metodo pagamento", type: "text", group: "Fattura" },
];

export const TICKET_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "subject", label: "Oggetto", type: "text", group: "Ticket" },
  { key: "status", label: "Stato", type: "select", group: "Ticket", options: [{ value: "aperto", label: "Aperto" }, { value: "in_corso", label: "In corso" }, { value: "risolto", label: "Risolto" }, { value: "chiuso", label: "Chiuso" }] },
  { key: "priority", label: "Priorità", type: "select", group: "Ticket", options: [{ value: "bassa", label: "Bassa" }, { value: "media", label: "Media" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }] },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Ticket" },
  { key: "created_at", label: "Data creazione", type: "date", group: "Ticket" },
  { key: "category", label: "Categoria", type: "text", group: "Ticket" },
];

export const TASK_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "title", label: "Titolo", type: "text", group: "Attività" },
  { key: "status", label: "Stato", type: "select", group: "Attività", options: [{ value: "da_fare", label: "Da fare" }, { value: "in_corso", label: "In corso" }, { value: "completata", label: "Completata" }, { value: "annullata", label: "Annullata" }] },
  { key: "priority", label: "Priorità", type: "select", group: "Attività", options: [{ value: "bassa", label: "Bassa" }, { value: "media", label: "Media" }, { value: "alta", label: "Alta" }] },
  { key: "assigned_to", label: "Utente assegnato", type: "user", group: "Attività" },
  { key: "due_date", label: "Data scadenza", type: "date", group: "Attività" },
  { key: "created_at", label: "Data creazione", type: "date", group: "Attività" },
];

export const CONSTRUCTION_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "project_name", label: "Nome cantiere", type: "text", group: "Cantiere" },
  { key: "status", label: "Stato", type: "select", group: "Cantiere", options: [{ value: "pianificazione", label: "Pianificazione" }, { value: "in_corso", label: "In corso" }, { value: "sospeso", label: "Sospeso" }, { value: "completato", label: "Completato" }] },
  { key: "phase", label: "Fase corrente", type: "text", group: "Cantiere" },
  { key: "assigned_to", label: "Responsabile", type: "user", group: "Cantiere" },
  { key: "start_date", label: "Data inizio", type: "date", group: "Cantiere" },
  { key: "end_date", label: "Data fine prevista", type: "date", group: "Cantiere" },
  { key: "budget", label: "Budget", type: "number", group: "Cantiere" },
  { key: "client_name", label: "Nome cliente", type: "text", group: "Cantiere" },
];

export const QUOTE_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "quote_number", label: "Numero preventivo", type: "text", group: "Preventivo" },
  { key: "status", label: "Stato", type: "select", group: "Preventivo", options: [{ value: "bozza", label: "Bozza" }, { value: "inviato", label: "Inviato" }, { value: "accettato", label: "Accettato" }, { value: "rifiutato", label: "Rifiutato" }, { value: "scaduto", label: "Scaduto" }] },
  { key: "total_amount", label: "Importo", type: "number", group: "Preventivo" },
  { key: "valid_until", label: "Valido fino al", type: "date", group: "Preventivo" },
  { key: "created_at", label: "Data creazione", type: "date", group: "Preventivo" },
  { key: "client_name", label: "Nome cliente", type: "text", group: "Preventivo" },
];

// ── Sprint 2B — Nuovi field defs per condizioni ──────────────────────────────

export const ORDER_TRIGGER_FIELDS_V2: TriggerFieldDef[] = [
  { key: "order_code",          label: "Codice ordine",       type: "text",    group: "Ordine" },
  { key: "status",              label: "Stato ordine",        type: "select",  group: "Ordine", options: [
    { value: "bozza",           label: "Bozza" },
    { value: "confermato",      label: "Confermato" },
    { value: "in_lavorazione",  label: "In lavorazione" },
    { value: "completato",      label: "Completato" },
    { value: "annullato",       label: "Annullato" },
  ]},
  { key: "total_amount",        label: "Importo totale (€)",  type: "number",  group: "Ordine" },
  { key: "deposit_amount",      label: "Acconto (€)",         type: "number",  group: "Ordine" },
  { key: "work_start_date",     label: "Data inizio lavori",  type: "date",    group: "Ordine" },
  { key: "work_end_date",       label: "Data fine lavori",    type: "date",    group: "Ordine" },
  { key: "has_building_bonus",  label: "Ha bonus edilizio",   type: "boolean", group: "Ordine" },
  { key: "payment_type",        label: "Tipo pagamento",      type: "select",  group: "Ordine", options: [
    { value: "contanti",            label: "Contanti" },
    { value: "bonifico",            label: "Bonifico" },
    { value: "finanziamento",       label: "Finanziamento" },
    { value: "cessione_credito",    label: "Cessione credito" },
  ]},
  { key: "deposit_paid",        label: "Acconto pagato",      type: "boolean", group: "Ordine" },
  { key: "balance_paid",        label: "Saldo pagato",        type: "boolean", group: "Ordine" },
  { key: "assigned_to",         label: "Assegnato a",         type: "user",    group: "Ordine" },
];

export const TICKET_TRIGGER_FIELDS_V2: TriggerFieldDef[] = [
  { key: "subject",           label: "Oggetto",                   type: "text",   group: "Ticket" },
  { key: "status",            label: "Stato",                     type: "select", group: "Ticket", options: [
    { value: "aperto",             label: "Aperto" },
    { value: "in_lavorazione",     label: "In lavorazione" },
    { value: "in_attesa_cliente",  label: "In attesa cliente" },
    { value: "risolto",            label: "Risolto" },
    { value: "chiuso",             label: "Chiuso" },
  ]},
  { key: "priority",          label: "Priorità",                  type: "select", group: "Ticket", options: [
    { value: "bassa",   label: "Bassa" },
    { value: "media",   label: "Media" },
    { value: "alta",    label: "Alta" },
    { value: "urgente", label: "Urgente 🔴" },
  ]},
  { key: "tipo",              label: "Tipo",                      type: "select", group: "Ticket", options: [
    { value: "assistenza",   label: "Assistenza" },
    { value: "intervento",   label: "Intervento tecnico" },
    { value: "sopralluogo",  label: "Sopralluogo" },
    { value: "garanzia",     label: "Garanzia" },
  ]},
  { key: "category",                    label: "Categoria",               type: "text",   group: "Ticket" },
  { key: "assigned_to",                 label: "Tecnico assegnato",       type: "user",   group: "Ticket" },
  { key: "data_intervento_prevista",    label: "Data intervento prevista", type: "date",  group: "Ticket" },
  { key: "durata_ore",                  label: "Durata ore",              type: "number", group: "Ticket" },
];

export const MAINTENANCE_TRIGGER_FIELDS: TriggerFieldDef[] = [
  { key: "tipo_impianto",   label: "Tipo impianto",       type: "text",   group: "Impianto" },
  { key: "marca",           label: "Marca",               type: "text",   group: "Impianto" },
  { key: "garanzia_scadenza", label: "Scadenza garanzia", type: "date",   group: "Impianto" },
  { key: "nome_contratto",  label: "Nome contratto",      type: "text",   group: "Manutenzione" },
  { key: "stato",           label: "Stato contratto",     type: "select", group: "Manutenzione", options: [
    { value: "attivo",      label: "Attivo" },
    { value: "in_scadenza", label: "In scadenza" },
    { value: "scaduto",     label: "Scaduto" },
    { value: "rinnovato",   label: "Rinnovato" },
  ]},
  { key: "importo_canone",  label: "Importo canone (€)",  type: "number", group: "Manutenzione" },
  { key: "data_scadenza",   label: "Data scadenza contratto", type: "date", group: "Manutenzione" },
  { key: "prossima_scadenza", label: "Prossima manutenzione", type: "date", group: "Piano" },
  { key: "frequenza_tipo",  label: "Frequenza",           type: "select", group: "Piano", options: [
    { value: "mensile",      label: "Mensile" },
    { value: "trimestrale",  label: "Trimestrale" },
    { value: "semestrale",   label: "Semestrale" },
    { value: "annuale",      label: "Annuale" },
  ]},
];

export const WAREHOUSE_TRIGGER_FIELDS_V2: TriggerFieldDef[] = [
  { key: "name",             label: "Nome articolo",      type: "text",   group: "Magazzino" },
  { key: "quantity",         label: "Quantità attuale",   type: "number", group: "Magazzino" },
  { key: "min_stock_level",  label: "Scorta minima",      type: "number", group: "Magazzino" },
  { key: "vat_rate",         label: "Aliquota IVA",       type: "number", group: "Magazzino" },
  { key: "unit_cost",        label: "Costo unitario (€)", type: "number", group: "Magazzino" },
];

export function getFieldsForCategory(category: string): TriggerFieldDef[] {
  switch (category) {
    case "contact":      return CONTACT_TRIGGER_FIELDS;
    case "opportunity":  return OPPORTUNITY_TRIGGER_FIELDS;
    case "appointment":  return APPOINTMENT_TRIGGER_FIELDS;
    case "communication":return COMMUNICATION_TRIGGER_FIELDS;
    case "system":       return SYSTEM_TRIGGER_FIELDS;
    case "social_media": return SOCIAL_MEDIA_TRIGGER_FIELDS;
    case "order":        return ORDER_TRIGGER_FIELDS_V2;    // Sprint 2B — extended
    case "invoice":      return INVOICE_TRIGGER_FIELDS;
    case "ticket":       return TICKET_TRIGGER_FIELDS_V2;   // Sprint 2B — extended
    case "task":         return TASK_TRIGGER_FIELDS;
    case "construction": return CONSTRUCTION_TRIGGER_FIELDS;
    case "quote":        return QUOTE_TRIGGER_FIELDS;
    case "maintenance":  return MAINTENANCE_TRIGGER_FIELDS; // Sprint 2B — nuovo
    case "warehouse":    return WAREHOUSE_TRIGGER_FIELDS_V2;// Sprint 2B — extended
    default:             return CONTACT_TRIGGER_FIELDS;
  }
}

export const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty", "today", "yesterday", "is_assigned", "is_not_assigned", "is_true", "is_false"];

