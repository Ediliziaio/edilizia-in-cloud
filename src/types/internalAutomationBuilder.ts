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

// ── Trigger Catalog ──────────────────────────────────

export type InternalTriggerCategory =
  | "ordini"
  | "ticket"
  | "task"
  | "dipendenti"
  | "magazzino"
  | "costi"
  | "calendario";

export interface PickerItem {
  id: string;
  label: string;
  icon: string;
  category: string;
  description?: string;
}

export const INTERNAL_TRIGGER_CATEGORIES: {
  key: InternalTriggerCategory;
  label: string;
  icon: string;
  items: PickerItem[];
}[] = [
  {
    key: "ordini",
    label: "Ordini / Commesse",
    icon: "ClipboardList",
    items: [
      { id: "order_created", label: "Ordine creato", icon: "Plus", category: "ordini", description: "Quando viene creato un nuovo ordine" },
      { id: "order_updated", label: "Ordine modificato", icon: "Edit", category: "ordini", description: "Quando un ordine viene aggiornato" },
      { id: "order_status_changed", label: "Stato ordine cambiato", icon: "RefreshCw", category: "ordini", description: "Quando lo stato di un ordine cambia" },
      { id: "order_overdue", label: "Ordine in ritardo", icon: "AlertTriangle", category: "ordini", description: "Quando un ordine supera la data prevista" },
      { id: "order_completed", label: "Ordine completato", icon: "CheckCircle", category: "ordini", description: "Quando un ordine viene completato" },
    ],
  },
  {
    key: "ticket",
    label: "Ticket / Assistenza",
    icon: "Headphones",
    items: [
      { id: "ticket_created", label: "Ticket creato", icon: "Plus", category: "ticket", description: "Quando viene aperto un nuovo ticket" },
      { id: "ticket_updated", label: "Ticket aggiornato", icon: "Edit", category: "ticket", description: "Quando un ticket viene modificato" },
      { id: "ticket_status_changed", label: "Stato ticket cambiato", icon: "RefreshCw", category: "ticket", description: "Quando lo stato di un ticket cambia" },
      { id: "ticket_assigned", label: "Ticket assegnato", icon: "UserCheck", category: "ticket", description: "Quando un ticket viene assegnato" },
    ],
  },
  {
    key: "task",
    label: "Attività",
    icon: "CheckSquare",
    items: [
      { id: "task_created", label: "Attività creata", icon: "Plus", category: "task", description: "Quando viene creata una nuova attività" },
      { id: "task_completed", label: "Attività completata", icon: "CheckCircle", category: "task", description: "Quando un'attività viene completata" },
      { id: "task_updated", label: "Attività modificata", icon: "Edit", category: "task", description: "Quando un'attività viene aggiornata" },
      { id: "task_overdue", label: "Attività scaduta", icon: "AlertTriangle", category: "task", description: "Quando un'attività supera la scadenza" },
    ],
  },
  {
    key: "magazzino",
    label: "Magazzino",
    icon: "Warehouse",
    items: [
      { id: "stock_below_minimum", label: "Sotto scorta minima", icon: "AlertTriangle", category: "magazzino", description: "Quando la quantità scende sotto il minimo" },
      { id: "stock_updated", label: "Giacenza aggiornata", icon: "RefreshCw", category: "magazzino", description: "Quando la quantità viene modificata" },
    ],
  },
  {
    key: "costi",
    label: "Costi",
    icon: "Receipt",
    items: [
      { id: "cost_created", label: "Costo registrato", icon: "Plus", category: "costi", description: "Quando viene inserito un nuovo costo" },
      { id: "cost_due", label: "Costo in scadenza", icon: "Calendar", category: "costi", description: "Quando un costo si avvicina alla scadenza" },
    ],
  },
  {
    key: "calendario",
    label: "Calendario / Appuntamenti",
    icon: "CalendarDays",
    items: [
      { id: "appointment_created", label: "Appuntamento creato", icon: "Plus", category: "calendario", description: "Quando viene creato un appuntamento" },
      { id: "appointment_updated", label: "Appuntamento modificato", icon: "Edit", category: "calendario", description: "Quando un appuntamento viene aggiornato" },
      { id: "appointment_reminder", label: "Promemoria appuntamento", icon: "Bell", category: "calendario", description: "Promemoria prima dell'appuntamento" },
    ],
  },
];

// ── Action Catalog ───────────────────────────────────

export type InternalActionCategory = "gestione" | "comunicazione" | "logica" | "integrazione";

export const INTERNAL_ACTION_CATEGORIES: {
  key: InternalActionCategory;
  label: string;
  icon: string;
  items: PickerItem[];
}[] = [
  {
    key: "gestione",
    label: "Gestione",
    icon: "Settings",
    items: [
      { id: "create_task", label: "Crea attività", icon: "CheckSquare", category: "gestione", description: "Crea una nuova attività assegnata" },
      { id: "update_order_status", label: "Aggiorna stato ordine", icon: "RefreshCw", category: "gestione", description: "Cambia lo stato di un ordine" },
      { id: "create_ticket", label: "Crea ticket", icon: "Headphones", category: "gestione", description: "Crea un nuovo ticket di assistenza" },
      { id: "create_calendar_event", label: "Crea evento calendario", icon: "CalendarDays", category: "gestione", description: "Crea un appuntamento nel calendario" },
    ],
  },
  {
    key: "comunicazione",
    label: "Comunicazione",
    icon: "MessageSquare",
    items: [
      { id: "send_notification", label: "Invia notifica interna", icon: "Bell", category: "comunicazione", description: "Invia una notifica interna allo staff" },
      { id: "send_email", label: "Invia email", icon: "Mail", category: "comunicazione", description: "Invia un'email al destinatario configurato" },
    ],
  },
  {
    key: "logica",
    label: "Logica",
    icon: "GitBranch",
    items: [
      { id: "if_condition", label: "Condizione If/Else", icon: "GitBranch", category: "logica", description: "Esegui rami diversi in base a una condizione" },
      { id: "wait_delay", label: "Attesa / Ritardo", icon: "Clock", category: "logica", description: "Attendi un periodo di tempo prima di continuare" },
    ],
  },
  {
    key: "integrazione",
    label: "Integrazione",
    icon: "Globe",
    items: [
      { id: "webhook", label: "Webhook HTTP", icon: "Globe", category: "integrazione", description: "Invia una richiesta HTTP a un endpoint esterno" },
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

// ── All trigger IDs flat ─────────────────────────────

export const ALL_INTERNAL_TRIGGERS = INTERNAL_TRIGGER_CATEGORIES.flatMap((c) => c.items);
export const ALL_INTERNAL_ACTIONS = INTERNAL_ACTION_CATEGORIES.flatMap((c) => c.items);

// ── Find label helpers ───────────────────────────────

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
