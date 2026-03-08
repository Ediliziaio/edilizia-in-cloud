export interface AutomationFlow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  version: number;
  folder_id: string | null;
  config_json: Record<string, any> | null;
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

export type TriggerCategory = "contact" | "opportunity" | "appointment" | "communication" | "system" | "ai_agent" | "social_media";
export type ActionCategory = "communication" | "crm" | "logic" | "integration";

export interface PickerItem {
  id: string;
  label: string;
  icon: string;
  category: string;
  description?: string;
}

export const TRIGGER_CATEGORIES: { key: TriggerCategory; label: string; icon: string; items: PickerItem[] }[] = [
  {
    key: "contact",
    label: "Contatto",
    icon: "User",
    items: [
      { id: "contact_created", label: "Contatto creato", icon: "UserPlus", category: "contact" },
      { id: "contact_updated", label: "Contatto modificato", icon: "UserCog", category: "contact" },
      { id: "tag_added", label: "Tag aggiunto", icon: "TagIcon", category: "contact" },
      { id: "tag_removed", label: "Tag rimosso", icon: "TagIcon", category: "contact" },
      { id: "custom_field_updated", label: "Campo personalizzato aggiornato", icon: "FileText", category: "contact" },
      { id: "custom_date", label: "Data personalizzata", icon: "CalendarClock", category: "contact" },
      { id: "birthday_reminder", label: "Promemoria compleanno", icon: "Cake", category: "contact" },
    ],
  },
  {
    key: "opportunity",
    label: "Opportunità",
    icon: "Target",
    items: [
      { id: "opportunity_created", label: "Opportunità creata", icon: "PlusCircle", category: "opportunity" },
      { id: "pipeline_stage_change", label: "Cambio fase", icon: "ArrowRightLeft", category: "opportunity" },
      { id: "opportunity_won", label: "Opportunità vinta", icon: "Trophy", category: "opportunity" },
      { id: "opportunity_lost", label: "Opportunità persa", icon: "XCircle", category: "opportunity" },
      { id: "opportunity_stale", label: "Opportunità stagnante", icon: "Clock", category: "opportunity" },
    ],
  },
  {
    key: "appointment",
    label: "Appuntamenti",
    icon: "CalendarDays",
    items: [
      { id: "appointment_booked", label: "Appuntamento prenotato", icon: "CalendarPlus", category: "appointment" },
      { id: "appointment_status_changed", label: "Stato modificato", icon: "CalendarCog", category: "appointment" },
      { id: "appointment_canceled", label: "Appuntamento cancellato", icon: "CalendarX", category: "appointment" },
    ],
  },
  {
    key: "communication",
    label: "Comunicazioni",
    icon: "MessageSquare",
    items: [
      { id: "email_opened", label: "Email aperta", icon: "MailOpen", category: "communication" },
      { id: "email_clicked", label: "Email cliccata", icon: "MousePointerClick", category: "communication" },
      { id: "whatsapp_received", label: "WhatsApp ricevuto", icon: "MessageCircle", category: "communication" },
      { id: "customer_replied", label: "Risposta cliente", icon: "Reply", category: "communication" },
      { id: "call_registered", label: "Chiamata registrata", icon: "Phone", category: "communication" },
    ],
  },
  {
    key: "system",
    label: "Sistema",
    icon: "Settings",
    items: [
      { id: "webhook_incoming", label: "Webhook in entrata", icon: "Webhook", category: "system" },
      { id: "scheduler", label: "Scheduler", icon: "Timer", category: "system" },
      { id: "form_submitted", label: "Modulo inviato", icon: "FileInput", category: "system" },
      { id: "survey_submitted", label: "Sondaggio inviato", icon: "ClipboardCheck", category: "system" },
    ],
  },
  {
    key: "ai_agent",
    label: "Agente AI",
    icon: "Bot",
    items: [
      { id: "ai_conversation_ended", label: "Conversazione AI terminata", icon: "Bot", category: "ai_agent" },
      { id: "ai_appointment_booked", label: "Appuntamento prenotato da AI", icon: "CalendarPlus", category: "ai_agent" },
      { id: "ai_contact_created", label: "Contatto creato da AI", icon: "UserPlus", category: "ai_agent" },
    ],
  },
];

export const ACTION_CATEGORIES: { key: ActionCategory; label: string; icon: string; items: PickerItem[] }[] = [
  {
    key: "communication",
    label: "Comunicazione",
    icon: "Mail",
    items: [
      { id: "send_email", label: "Invia Email", icon: "Mail", category: "communication" },
      { id: "send_whatsapp", label: "Invia WhatsApp", icon: "MessageCircle", category: "communication" },
      { id: "send_sms", label: "Invia SMS", icon: "Smartphone", category: "communication" },
      { id: "send_notification", label: "Invia Notifica", icon: "Bell", category: "communication" },
      { id: "send_ai_message", label: "Invia Messaggio AI", icon: "Bot", category: "communication", description: "Genera e invia un messaggio con AI" },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    icon: "Users",
    items: [
      { id: "create_opportunity", label: "Crea opportunità", icon: "PlusCircle", category: "crm" },
      { id: "move_opportunity", label: "Sposta opportunità", icon: "ArrowRightLeft", category: "crm" },
      { id: "update_field", label: "Aggiorna campo", icon: "FileEdit", category: "crm" },
      { id: "add_tag", label: "Aggiungi tag", icon: "TagIcon", category: "crm" },
      { id: "remove_tag", label: "Rimuovi tag", icon: "TagIcon", category: "crm" },
      { id: "assign_user", label: "Assegna utente", icon: "UserCheck", category: "crm" },
      { id: "create_task", label: "Crea attività", icon: "ListTodo", category: "crm" },
      { id: "update_contact_score", label: "Aggiorna punteggio", icon: "TrendingUp", category: "crm", description: "Modifica il lead score del contatto (+/- o valore assoluto)" },
      { id: "remove_from_automation", label: "Rimuovi da automazione", icon: "UserMinus", category: "crm", description: "Rimuove il contatto da un altro workflow attivo" },
    ],
  },
  {
    key: "logic",
    label: "Logica",
    icon: "GitBranch",
    items: [
      { id: "delay", label: "Attendi (Delay)", icon: "Clock", category: "logic", description: "Attendi X giorni/ore prima di proseguire" },
      { id: "if_else", label: "If / Else", icon: "GitBranch", category: "logic", description: "Condizione con 2 rami" },
      { id: "split_percentage", label: "Split percentuale", icon: "Percent", category: "logic", description: "Dividi il flusso in base a percentuali" },
      { id: "goal", label: "Obiettivo (Goal)", icon: "Target", category: "logic", description: "Punto di arrivo dell'automazione" },
      { id: "jump_to_step", label: "Salta a step", icon: "CornerDownRight", category: "logic", description: "Salta ad un altro nodo del flusso" },
      { id: "end_automation", label: "Termina automazione", icon: "StopCircle", category: "logic" },
      { id: "wait_for_event", label: "Attendi evento", icon: "Hourglass", category: "logic", description: "Metti in pausa il flusso fino a quando si verifica un evento o scade il timeout" },
    ],
  },
  {
    key: "integration",
    label: "Integrazione",
    icon: "Plug",
    items: [
      { id: "webhook_out", label: "Webhook uscita", icon: "ExternalLink", category: "integration" },
      { id: "external_api", label: "API esterna", icon: "Globe", category: "integration", description: "Chiama un'API esterna" },
      { id: "sync_google", label: "Sync Google Calendar", icon: "RefreshCw", category: "integration", description: "Sincronizza appuntamenti con Google Calendar" },
      { id: "sync_meta_lead", label: "Sync Meta Lead", icon: "RefreshCw", category: "integration", description: "Re-sincronizza lead da Meta Lead Ads" },
      { id: "call_with_ai_agent", label: "Chiama con AI", icon: "Bot", category: "integration", description: "Avvia una chiamata outbound tramite un agente AI" },
    ],
  },
];

export const NODE_TYPE_COLORS: Record<string, string> = {
  trigger: "border-orange-400 bg-orange-50 dark:bg-orange-950/30",
  action: "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
  condition: "border-purple-400 bg-purple-50 dark:bg-purple-950/30",
  delay: "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
  goal: "border-green-400 bg-green-50 dark:bg-green-950/30",
  split: "border-teal-400 bg-teal-50 dark:bg-teal-950/30",
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  trigger: "Trigger",
  action: "Azione",
  condition: "Condizione",
  delay: "Attesa",
  goal: "Obiettivo",
  split: "Split",
};

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

export function getFieldsForCategory(category: string): TriggerFieldDef[] {
  switch (category) {
    case "contact": return CONTACT_TRIGGER_FIELDS;
    case "opportunity": return OPPORTUNITY_TRIGGER_FIELDS;
    case "appointment": return APPOINTMENT_TRIGGER_FIELDS;
    case "communication": return COMMUNICATION_TRIGGER_FIELDS;
    case "system": return SYSTEM_TRIGGER_FIELDS;
    default: return CONTACT_TRIGGER_FIELDS;
  }
}

export const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty", "today", "yesterday", "is_assigned", "is_not_assigned", "is_true", "is_false"];

// Trigger descriptions
export const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  contact_created: "Si attiva nel momento in cui viene aggiunto un nuovo record di contatto.",
  contact_updated: "Si attiva quando un contatto esistente viene modificato.",
  tag_added: "Si attiva quando un tag viene aggiunto ad un contatto.",
  tag_removed: "Si attiva quando un tag viene rimosso da un contatto.",
  custom_field_updated: "Si attiva quando un campo personalizzato viene aggiornato.",
  custom_date: "Si attiva ad una data personalizzata specifica.",
  birthday_reminder: "Si attiva come promemoria prima del compleanno del contatto.",
  opportunity_created: "Si attiva quando viene creata una nuova opportunità.",
  pipeline_stage_change: "Si attiva quando un'opportunità cambia fase nella pipeline.",
  opportunity_won: "Si attiva quando un'opportunità viene segnata come vinta.",
  opportunity_lost: "Si attiva quando un'opportunità viene segnata come persa.",
  opportunity_stale: "Si attiva quando un'opportunità resta inattiva per troppo tempo.",
  appointment_booked: "Si attiva quando viene prenotato un nuovo appuntamento.",
  appointment_status_changed: "Si attiva quando lo stato di un appuntamento cambia.",
  appointment_canceled: "Si attiva quando un appuntamento viene cancellato.",
  email_opened: "Si attiva quando un'email viene aperta dal destinatario.",
  email_clicked: "Si attiva quando un link nell'email viene cliccato.",
  whatsapp_received: "Si attiva quando viene ricevuto un messaggio WhatsApp.",
  customer_replied: "Si attiva quando un cliente risponde ad un messaggio.",
  call_registered: "Si attiva quando viene registrata una chiamata.",
  webhook_incoming: "Si attiva quando viene ricevuto un webhook in entrata.",
  scheduler: "Si attiva ad intervalli programmati.",
  form_submitted: "Si attiva quando un modulo viene inviato.",
  survey_submitted: "Si attiva quando un sondaggio viene completato.",
  ai_conversation_ended: "Si attiva quando una conversazione con un agente AI termina.",
  ai_appointment_booked: "Si attiva quando un agente AI prenota un appuntamento.",
  ai_contact_created: "Si attiva quando un agente AI crea un nuovo contatto.",
};

// ── Action descriptions ──

export const ACTION_DESCRIPTIONS: Record<string, string> = {
  send_email: "Invia un'email personalizzata al contatto utilizzando un template o contenuto personalizzato.",
  send_whatsapp: "Invia un messaggio WhatsApp al contatto.",
  send_sms: "Invia un SMS al contatto con testo personalizzato.",
  send_notification: "Invia una notifica interna agli utenti del sistema.",
  send_ai_message: "Genera e invia un messaggio con intelligenza artificiale.",
  create_opportunity: "Crea una nuova opportunità nella pipeline selezionata.",
  move_opportunity: "Sposta un'opportunità in una fase o pipeline diversa.",
  update_field: "Aggiorna un campo specifico del contatto o dell'opportunità.",
  add_tag: "Aggiunge uno o più tag al contatto nell'automazione.",
  remove_tag: "Rimuove uno o più tag dal contatto nell'automazione.",
  assign_user: "Assegna un utente specifico o tramite round robin.",
  create_task: "Crea una nuova attività assegnata ad un utente.",
  delay: "Attende un periodo di tempo prima di proseguire nel flusso.",
  if_else: "Valuta una condizione e divide il flusso in due rami.",
  split_percentage: "Divide il flusso in base a percentuali definite (A/B test).",
  goal: "Definisce un punto obiettivo nell'automazione con timeout opzionale.",
  jump_to_step: "Salta ad un altro nodo specifico del flusso.",
  end_automation: "Termina l'automazione per il contatto corrente.",
  webhook_out: "Invia una richiesta HTTP ad un endpoint esterno.",
  external_api: "Chiama un'API esterna con metodo e payload personalizzati.",
  sync_google: "Sincronizza appuntamenti ed eventi con Google Calendar tramite la connessione attiva.",
  sync_meta_lead: "Sincronizza contatti con Meta Lead Ads. L'import dei lead è automatico via webhook; questa azione permette il re-sync manuale.",
  call_with_ai_agent: "Avvia una chiamata outbound verso il contatto tramite un agente AI selezionato. Richiede crediti AI e un numero di telefono configurato.",
  remove_from_automation: "Rimuove il contatto da un altro workflow attivo, terminando la sua iscrizione.",
  wait_for_event: "Mette in pausa il flusso fino a quando si verifica un evento specifico o scade il timeout configurato.",
  update_contact_score: "Modifica il lead score del contatto. Puoi aggiungere, sottrarre o impostare un valore assoluto.",
};

// ── Action validation ──

export interface ActionValidationError {
  field: string;
  message: string;
}

export function validateActionConfig(actionType: string, config: Record<string, any>): ActionValidationError[] {
  const errors: ActionValidationError[] = [];

  switch (actionType) {
    case "send_email":
      if (!config.subject_override && !config.template_id) {
        errors.push({ field: "subject_override", message: "Oggetto email o template obbligatorio" });
      }
      break;
    case "send_whatsapp":
      if (!config.whatsapp_text && !config.whatsapp_template) {
        errors.push({ field: "whatsapp_text", message: "Testo o template WhatsApp obbligatorio" });
      }
      break;
    case "send_sms":
      if (!config.sms_text) {
        errors.push({ field: "sms_text", message: "Testo SMS obbligatorio" });
      }
      break;
    case "send_notification":
      if (!config.notification_title) {
        errors.push({ field: "notification_title", message: "Titolo notifica obbligatorio" });
      }
      break;
    case "send_ai_message":
      if (!config.ai_prompt) {
        errors.push({ field: "ai_prompt", message: "Prompt AI obbligatorio" });
      }
      break;
    case "create_opportunity":
      if (!config.opportunity_name) {
        errors.push({ field: "opportunity_name", message: "Nome opportunità obbligatorio" });
      }
      if (!config.pipeline_id) {
        errors.push({ field: "pipeline_id", message: "Pipeline obbligatoria" });
      }
      break;
    case "move_opportunity":
      if (!config.target_pipeline_id) {
        errors.push({ field: "target_pipeline_id", message: "Pipeline destinazione obbligatoria" });
      }
      break;
    case "update_field":
      if (!config.entity_type) {
        errors.push({ field: "entity_type", message: "Entità obbligatoria" });
      }
      if (!config.field_key) {
        errors.push({ field: "field_key", message: "Campo obbligatorio" });
      }
      break;
    case "add_tag":
    case "remove_tag":
      if (!config.tags || (Array.isArray(config.tags) && config.tags.length === 0)) {
        errors.push({ field: "tags", message: "Seleziona almeno un tag" });
      }
      break;
    case "assign_user":
      if (config.assign_method !== "round_robin" && !config.assign_user_id) {
        errors.push({ field: "assign_user_id", message: "Seleziona un utente" });
      }
      break;
    case "create_task":
      if (!config.task_title) {
        errors.push({ field: "task_title", message: "Titolo attività obbligatorio" });
      }
      break;
    case "webhook_out":
      if (!config.webhook_url) {
        errors.push({ field: "webhook_url", message: "URL obbligatorio" });
      } else {
        try { new URL(config.webhook_url); } catch {
          errors.push({ field: "webhook_url", message: "URL non valido" });
        }
      }
      break;
    case "external_api":
      if (!config.api_url) {
        errors.push({ field: "api_url", message: "URL API obbligatorio" });
      }
      break;
    case "jump_to_step":
      if (!config.target_node_id) {
        errors.push({ field: "target_node_id", message: "Seleziona un nodo destinazione" });
      }
      break;
    case "remove_from_automation":
      if (!config.target_flow_id) {
        errors.push({ field: "target_flow_id", message: "Seleziona un workflow" });
      }
      break;
    case "wait_for_event":
      if (!config.await_event) {
        errors.push({ field: "await_event", message: "Seleziona un evento da attendere" });
      }
      break;
    case "call_with_ai_agent":
      if (!config.ai_agent_id) {
        errors.push({ field: "ai_agent_id", message: "Seleziona un agente AI" });
      }
      break;
    case "update_contact_score":
      if (config.score_value === undefined || config.score_value === "" || config.score_value === null) {
        errors.push({ field: "score_value", message: "Valore punteggio obbligatorio" });
      }
      break;
  }

  return errors;
}
