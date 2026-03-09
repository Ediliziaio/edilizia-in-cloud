// ═══════════════════════════════════════════════════════
// Internal Automation Builder — Types & Catalogs
// ═══════════════════════════════════════════════════════

export interface InternalAutomationFlow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "paused" | "archived";
  trigger_type: string;
  trigger_config: Record<string, any>;
  created_by: string;
  updated_by: string | null;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternalAutomationNode {
  id: string;
  flow_id: string;
  company_id: string;
  node_type: "trigger" | "action" | "condition" | "delay";
  config_json: Record<string, any>;
  label: string | null;
  position_x: number;
  position_y: number;
  created_at: string;
  updated_at: string;
}

export interface InternalAutomationConnection {
  id: string;
  flow_id: string;
  company_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
  created_at: string;
}

// ── Config Field Types ───────────────────────────────

export type ConfigFieldType = "text" | "textarea" | "select" | "number" | "multi_select" | "user_select";

export interface ConfigFieldOption {
  value: string;
  label: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  placeholder?: string;
  required?: boolean;
  options?: ConfigFieldOption[];
  supportsVariables?: boolean;
  defaultValue?: any;
  min?: number;
  max?: number;
}

export interface AvailableVariable {
  key: string;
  label: string;
  example?: string;
}

// ── Catalog Item (trigger or action) ─────────────────

export interface CatalogItem {
  id: string;
  label: string;
  icon: string;
  category: string;
  description?: string;
  configFields?: ConfigField[];
  availableVariables?: AvailableVariable[];
  disabled?: boolean;
  disabledReason?: string;
}

// ── PickerItem (backward compat) ─────────────────────
export type PickerItem = CatalogItem;

// ── Trigger Catalog ──────────────────────────────────

export type InternalTriggerCategory =
  | "ordini"
  | "ticket"
  | "task"
  | "dipendenti"
  | "magazzino"
  | "costi"
  | "calendario";

// Common variables per entity type
const ORDER_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Ordine" },
  { key: "description", label: "Descrizione ordine" },
  { key: "total_amount", label: "Importo totale", example: "1500.00" },
  { key: "current_status_id", label: "ID stato corrente" },
  { key: "customer_id", label: "ID cliente" },
  { key: "expected_date", label: "Data prevista" },
  { key: "company_id", label: "ID azienda" },
];

const TICKET_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Ticket" },
  { key: "subject", label: "Oggetto ticket" },
  { key: "status", label: "Stato ticket", example: "aperto" },
  { key: "priority", label: "Priorità", example: "alta" },
  { key: "customer_id", label: "ID cliente" },
  { key: "assigned_to", label: "ID assegnato" },
  { key: "order_id", label: "ID ordine collegato" },
  { key: "company_id", label: "ID azienda" },
];

const TASK_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Attività" },
  { key: "title", label: "Titolo attività" },
  { key: "status", label: "Stato", example: "completed" },
  { key: "priority", label: "Priorità" },
  { key: "assigned_to", label: "ID assegnato" },
  { key: "due_date", label: "Data scadenza" },
  { key: "company_id", label: "ID azienda" },
];

const STOCK_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Articolo" },
  { key: "name", label: "Nome articolo" },
  { key: "quantity", label: "Quantità attuale" },
  { key: "min_stock_level", label: "Scorta minima" },
  { key: "unit_cost", label: "Costo unitario" },
  { key: "company_id", label: "ID azienda" },
];

const COST_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Costo" },
  { key: "description", label: "Descrizione" },
  { key: "amount", label: "Importo" },
  { key: "category", label: "Categoria" },
  { key: "company_id", label: "ID azienda" },
];

const EMPLOYEE_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Dipendente" },
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "role_type", label: "Ruolo" },
  { key: "company_id", label: "ID azienda" },
];

const APPOINTMENT_VARIABLES: AvailableVariable[] = [
  { key: "id", label: "ID Appuntamento" },
  { key: "title", label: "Titolo" },
  { key: "appointment_date", label: "Data" },
  { key: "appointment_time", label: "Ora" },
  { key: "description", label: "Descrizione" },
  { key: "company_id", label: "ID azienda" },
];

export const INTERNAL_TRIGGER_CATEGORIES: {
  key: InternalTriggerCategory;
  label: string;
  icon: string;
  items: CatalogItem[];
}[] = [
  {
    key: "ordini",
    label: "Ordini / Commesse",
    icon: "ClipboardList",
    items: [
      { id: "order_created", label: "Ordine creato", icon: "Plus", category: "ordini", description: "Quando viene creato un nuovo ordine", availableVariables: ORDER_VARIABLES },
      { id: "order_updated", label: "Ordine modificato", icon: "Edit", category: "ordini", description: "Quando un ordine viene aggiornato", availableVariables: ORDER_VARIABLES },
      { id: "order_status_changed", label: "Stato ordine cambiato", icon: "RefreshCw", category: "ordini", description: "Quando lo stato di un ordine cambia", availableVariables: [...ORDER_VARIABLES, { key: "_old.current_status_id", label: "Stato precedente" }] },
      { id: "order_overdue", label: "Ordine in ritardo", icon: "AlertTriangle", category: "ordini", description: "Quando un ordine supera la data prevista", availableVariables: ORDER_VARIABLES, disabled: true, disabledReason: "Prossimamente" },
      { id: "order_completed", label: "Ordine completato", icon: "CheckCircle", category: "ordini", description: "Quando un ordine viene completato", availableVariables: ORDER_VARIABLES },
    ],
  },
  {
    key: "ticket",
    label: "Ticket / Assistenza",
    icon: "Headphones",
    items: [
      { id: "ticket_created", label: "Ticket creato", icon: "Plus", category: "ticket", description: "Quando viene aperto un nuovo ticket", availableVariables: TICKET_VARIABLES },
      { id: "ticket_updated", label: "Ticket aggiornato", icon: "Edit", category: "ticket", description: "Quando un ticket viene modificato", availableVariables: TICKET_VARIABLES },
      { id: "ticket_status_changed", label: "Stato ticket cambiato", icon: "RefreshCw", category: "ticket", description: "Quando lo stato di un ticket cambia", availableVariables: [...TICKET_VARIABLES, { key: "_old.status", label: "Stato precedente" }] },
      { id: "ticket_assigned", label: "Ticket assegnato", icon: "UserCheck", category: "ticket", description: "Quando un ticket viene assegnato", availableVariables: TICKET_VARIABLES },
    ],
  },
  {
    key: "task",
    label: "Attività",
    icon: "CheckSquare",
    items: [
      { id: "task_created", label: "Attività creata", icon: "Plus", category: "task", description: "Quando viene creata una nuova attività", availableVariables: TASK_VARIABLES },
      { id: "task_completed", label: "Attività completata", icon: "CheckCircle", category: "task", description: "Quando un'attività viene completata", availableVariables: TASK_VARIABLES },
      { id: "task_updated", label: "Attività modificata", icon: "Edit", category: "task", description: "Quando un'attività viene aggiornata", availableVariables: TASK_VARIABLES },
      { id: "task_overdue", label: "Attività scaduta", icon: "AlertTriangle", category: "task", description: "Quando un'attività supera la scadenza", availableVariables: TASK_VARIABLES },
    ],
  },
  {
    key: "magazzino",
    label: "Magazzino",
    icon: "Warehouse",
    items: [
      { id: "stock_below_minimum", label: "Sotto scorta minima", icon: "AlertTriangle", category: "magazzino", description: "Quando la quantità scende sotto il minimo", availableVariables: STOCK_VARIABLES },
      { id: "stock_updated", label: "Giacenza aggiornata", icon: "RefreshCw", category: "magazzino", description: "Quando la quantità viene modificata", availableVariables: STOCK_VARIABLES },
    ],
  },
  {
    key: "costi",
    label: "Costi",
    icon: "Receipt",
    items: [
      { id: "cost_created", label: "Costo registrato", icon: "Plus", category: "costi", description: "Quando viene inserito un nuovo costo", availableVariables: COST_VARIABLES },
      { id: "cost_due", label: "Costo in scadenza", icon: "Calendar", category: "costi", description: "Quando un costo si avvicina alla scadenza", availableVariables: COST_VARIABLES },
    ],
  },
  {
    key: "dipendenti",
    label: "Dipendenti",
    icon: "Users",
    items: [
      { id: "employee_added", label: "Dipendente aggiunto", icon: "UserPlus", category: "dipendenti", description: "Quando viene aggiunto un nuovo dipendente", availableVariables: EMPLOYEE_VARIABLES },
    ],
  },
  {
    key: "calendario",
    label: "Calendario / Appuntamenti",
    icon: "CalendarDays",
    items: [
      { id: "appointment_created", label: "Appuntamento creato", icon: "Plus", category: "calendario", description: "Quando viene creato un appuntamento", availableVariables: APPOINTMENT_VARIABLES },
      { id: "appointment_updated", label: "Appuntamento modificato", icon: "Edit", category: "calendario", description: "Quando un appuntamento viene aggiornato", availableVariables: APPOINTMENT_VARIABLES },
      { id: "appointment_reminder", label: "Promemoria appuntamento", icon: "Bell", category: "calendario", description: "Promemoria prima dell'appuntamento", availableVariables: APPOINTMENT_VARIABLES },
    ],
  },
];

// ── Action Catalog ───────────────────────────────────

export type InternalActionCategory = "gestione" | "comunicazione" | "logica" | "integrazione";

const PRIORITY_OPTIONS: ConfigFieldOption[] = [
  { value: "low", label: "Bassa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export const INTERNAL_ACTION_CATEGORIES: {
  key: InternalActionCategory;
  label: string;
  icon: string;
  items: CatalogItem[];
}[] = [
  {
    key: "gestione",
    label: "Gestione",
    icon: "Settings",
    items: [
      {
        id: "create_task", label: "Crea attività", icon: "CheckSquare", category: "gestione",
        description: "Crea una nuova attività assegnata",
        configFields: [
          { key: "task_title", label: "Titolo attività", type: "text", placeholder: "es. Verificare ordine {{id}}", supportsVariables: true, required: true },
          { key: "task_notes", label: "Note", type: "textarea", placeholder: "Note...", supportsVariables: true },
          { key: "task_priority", label: "Priorità", type: "select", options: PRIORITY_OPTIONS, defaultValue: "medium" },
          { key: "task_due_days", label: "Scadenza (giorni da ora)", type: "number", placeholder: "es. 3", min: 0 },
          { key: "assign_to", label: "Assegna a (ID utente)", type: "text", placeholder: "Lascia vuoto per non assegnare" },
        ],
      },
      {
        id: "update_order_status", label: "Aggiorna stato ordine", icon: "RefreshCw", category: "gestione",
        description: "Cambia lo stato di un ordine",
        configFields: [
          { key: "new_status", label: "Nuovo stato ordine", type: "text", placeholder: "es. in_lavorazione", required: true },
        ],
      },
      {
        id: "create_ticket", label: "Crea ticket", icon: "Headphones", category: "gestione",
        description: "Crea un nuovo ticket di assistenza",
        configFields: [
          { key: "ticket_subject", label: "Oggetto ticket", type: "text", placeholder: "Oggetto...", supportsVariables: true, required: true },
          { key: "ticket_priority", label: "Priorità", type: "select", options: PRIORITY_OPTIONS, defaultValue: "medium" },
        ],
      },
      {
        id: "create_calendar_event", label: "Crea evento calendario", icon: "CalendarDays", category: "gestione",
        description: "Crea un appuntamento nel calendario",
        configFields: [
          { key: "event_title", label: "Titolo evento", type: "text", placeholder: "Titolo...", supportsVariables: true, required: true },
          { key: "event_description", label: "Descrizione", type: "textarea", placeholder: "Descrizione...", supportsVariables: true },
          { key: "event_date", label: "Data (YYYY-MM-DD)", type: "text", placeholder: "es. 2026-01-15" },
          { key: "event_time", label: "Ora (HH:MM)", type: "text", placeholder: "es. 09:00" },
        ],
      },
      {
        id: "assign_employee", label: "Assegna dipendente", icon: "UserCheck", category: "gestione",
        description: "Assegna un dipendente all'entità",
        configFields: [
          { key: "employee_id", label: "ID dipendente", type: "text", placeholder: "ID del dipendente", required: true },
        ],
      },
      {
        id: "add_cost_record", label: "Registra costo", icon: "Receipt", category: "gestione",
        description: "Aggiunge un record di costo",
        configFields: [
          { key: "cost_description", label: "Descrizione", type: "text", placeholder: "Descrizione costo...", supportsVariables: true, required: true },
          { key: "cost_amount", label: "Importo (€)", type: "number", placeholder: "0.00", required: true },
          { key: "cost_category", label: "Categoria", type: "text", placeholder: "es. materiali" },
        ],
      },
    ],
  },
  {
    key: "comunicazione",
    label: "Comunicazione",
    icon: "MessageSquare",
    items: [
      {
        id: "send_notification", label: "Invia notifica interna", icon: "Bell", category: "comunicazione",
        description: "Invia una notifica interna allo staff",
        configFields: [
          { key: "notification_title", label: "Titolo notifica", type: "text", placeholder: "Titolo...", supportsVariables: true, required: true },
          { key: "notification_message", label: "Messaggio", type: "textarea", placeholder: "Messaggio...", supportsVariables: true, required: true },
          { key: "notify_user_id", label: "Destinatario (ID utente)", type: "text", placeholder: "Lascia vuoto per tutti" },
        ],
      },
      {
        id: "send_email", label: "Invia email", icon: "Mail", category: "comunicazione",
        description: "Invia un'email al destinatario configurato",
        configFields: [
          { key: "email_to", label: "Destinatario email", type: "text", placeholder: "email@example.com", supportsVariables: true, required: true },
          { key: "email_subject", label: "Oggetto", type: "text", placeholder: "Oggetto...", supportsVariables: true, required: true },
          { key: "email_body", label: "Corpo", type: "textarea", placeholder: "Corpo email...", supportsVariables: true, required: true },
        ],
      },
    ],
  },
  {
    key: "logica",
    label: "Logica",
    icon: "GitBranch",
    items: [
      {
        id: "if_condition", label: "Condizione If/Else", icon: "GitBranch", category: "logica",
        description: "Esegui rami diversi in base a una condizione",
        configFields: [
          { key: "condition_field", label: "Campo da valutare", type: "text", placeholder: "es. status", required: true },
          {
            key: "condition_operator", label: "Operatore", type: "select", defaultValue: "equals",
            options: [
              { value: "equals", label: "Uguale a" },
              { value: "not_equals", label: "Diverso da" },
              { value: "contains", label: "Contiene" },
              { value: "greater_than", label: "Maggiore di" },
              { value: "less_than", label: "Minore di" },
              { value: "is_empty", label: "È vuoto" },
              { value: "is_not_empty", label: "Non è vuoto" },
            ],
          },
          { key: "condition_value", label: "Valore", type: "text", placeholder: "Valore..." },
        ],
      },
      {
        id: "wait_delay", label: "Attesa / Ritardo", icon: "Clock", category: "logica",
        description: "Attendi un periodo di tempo prima di continuare",
        configFields: [
          { key: "delay_days", label: "Giorni", type: "number", defaultValue: 0, min: 0 },
          { key: "delay_hours", label: "Ore", type: "number", defaultValue: 0, min: 0, max: 23 },
          { key: "delay_minutes", label: "Minuti", type: "number", defaultValue: 0, min: 0, max: 59 },
        ],
      },
    ],
  },
  {
    key: "integrazione",
    label: "Integrazione",
    icon: "Globe",
    items: [
      {
        id: "webhook", label: "Webhook HTTP", icon: "Globe", category: "integrazione",
        description: "Invia una richiesta HTTP a un endpoint esterno",
        configFields: [
          { key: "webhook_url", label: "URL", type: "text", placeholder: "https://...", required: true },
          {
            key: "webhook_method", label: "Metodo", type: "select", defaultValue: "POST",
            options: [
              { value: "POST", label: "POST" },
              { value: "GET", label: "GET" },
              { value: "PUT", label: "PUT" },
            ],
          },
          { key: "webhook_body", label: "Corpo JSON", type: "textarea", placeholder: '{"key": "value"}', supportsVariables: true },
        ],
      },
    ],
  },
];

// ── Node type display labels ─────────────────────────

export const INTERNAL_NODE_TYPE_LABELS: Record<string, string> = {
  trigger: "Trigger",
  action: "Azione",
  condition: "Condizione",
  delay: "Ritardo",
};

// ── All items flat ───────────────────────────────────

export const ALL_INTERNAL_TRIGGERS = INTERNAL_TRIGGER_CATEGORIES.flatMap((c) => c.items);
export const ALL_INTERNAL_ACTIONS = INTERNAL_ACTION_CATEGORIES.flatMap((c) => c.items);

// ── Find helpers ─────────────────────────────────────

export function findTriggerLabel(triggerId: string): string {
  return ALL_INTERNAL_TRIGGERS.find((t) => t.id === triggerId)?.label || triggerId;
}

export function findActionLabel(actionId: string): string {
  return ALL_INTERNAL_ACTIONS.find((a) => a.id === actionId)?.label || actionId;
}

export function findTriggerDescription(triggerId: string): string {
  return ALL_INTERNAL_TRIGGERS.find((t) => t.id === triggerId)?.description || "";
}

export function findActionDescription(actionId: string): string {
  return ALL_INTERNAL_ACTIONS.find((a) => a.id === actionId)?.description || "";
}

export function findTriggerItem(triggerId: string): CatalogItem | undefined {
  return ALL_INTERNAL_TRIGGERS.find((t) => t.id === triggerId);
}

export function findActionItem(actionId: string): CatalogItem | undefined {
  return ALL_INTERNAL_ACTIONS.find((a) => a.id === actionId);
}

/** Get available variables for a trigger type */
export function getTriggerVariables(triggerId: string): AvailableVariable[] {
  return findTriggerItem(triggerId)?.availableVariables || [];
}
