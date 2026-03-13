// ── Flow Node Catalog — unified source for ReactFlow builder ──
// Derives from existing TRIGGER_CATEGORIES / ACTION_CATEGORIES in automationBuilder.ts
// Adds configSchema for dynamic form rendering.

import {
  TRIGGER_CATEGORIES,
  ACTION_CATEGORIES,
  TRIGGER_DESCRIPTIONS,
  ACTION_DESCRIPTIONS,
} from "@/types/automationBuilder";

// ── Schema types ──

export interface ConfigFieldSchema {
  id: string;
  label: string;
  type: "text" | "select" | "textarea" | "number" | "boolean" | "tags";
  required?: boolean;
  options?: { value: string; label: string }[];
  supportsVariables?: boolean;
  placeholder?: string;
  defaultValue?: any;
}

export interface VariableDefinition {
  key: string;
  label: string;
  type: "string" | "number" | "date" | "boolean";
}

export type FlowNodeKind = "trigger" | "action" | "condition" | "delay" | "goal" | "split" | "note";

export interface CatalogItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: string;
  categoryLabel: string;
  kind: FlowNodeKind;
  configSchema?: ConfigFieldSchema[];
  outputVariables?: VariableDefinition[];
}

// ── Derive node kind from action id ──

function kindFromActionId(id: string): FlowNodeKind {
  switch (id) {
    case "if_else":
      return "condition";
    case "delay":
    case "wait_for_event":
      return "delay";
    case "goal":
      return "goal";
    case "split_percentage":
      return "split";
    default:
      return "action";
  }
}

// ── Config schemas per action type ──

const ACTION_CONFIG_SCHEMAS: Record<string, ConfigFieldSchema[]> = {
  send_email: [
    { id: "subject_override", label: "Oggetto", type: "text", required: true, supportsVariables: true, placeholder: "Oggetto email..." },
    { id: "body_html", label: "Corpo email", type: "textarea", supportsVariables: true },
  ],
  send_whatsapp: [
    { id: "whatsapp_text", label: "Messaggio", type: "textarea", required: true, supportsVariables: true, placeholder: "Testo messaggio..." },
  ],
  send_sms: [
    { id: "sms_text", label: "Testo SMS", type: "textarea", required: true, supportsVariables: true },
  ],
  send_notification: [
    { id: "notification_title", label: "Titolo", type: "text", required: true, supportsVariables: true },
    { id: "notification_body", label: "Messaggio", type: "textarea", supportsVariables: true },
  ],
  send_ai_message: [
    { id: "ai_prompt", label: "Prompt AI", type: "textarea", required: true, supportsVariables: true },
    { id: "ai_channel", label: "Canale invio", type: "select", options: [{ value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }] },
  ],
  create_opportunity: [
    { id: "opportunity_name", label: "Nome opportunità", type: "text", required: true, supportsVariables: true },
    { id: "pipeline_id", label: "Pipeline", type: "select", required: true },
  ],
  move_opportunity: [
    { id: "target_pipeline_id", label: "Pipeline destinazione", type: "select", required: true },
    { id: "target_stage_id", label: "Fase destinazione", type: "select" },
  ],
  update_field: [
    { id: "entity_type", label: "Entità", type: "select", required: true, options: [{ value: "contact", label: "Contatto" }, { value: "opportunity", label: "Opportunità" }] },
    { id: "field_key", label: "Campo", type: "text", required: true },
    { id: "field_value", label: "Valore", type: "text", supportsVariables: true },
  ],
  add_tag: [{ id: "tags", label: "Tag", type: "tags", required: true }],
  remove_tag: [{ id: "tags", label: "Tag", type: "tags", required: true }],
  assign_user: [
    { id: "assign_method", label: "Metodo", type: "select", options: [{ value: "specific", label: "Utente specifico" }, { value: "round_robin", label: "Round Robin" }] },
    { id: "assign_user_id", label: "Utente", type: "select" },
  ],
  create_task: [
    { id: "task_title", label: "Titolo attività", type: "text", required: true, supportsVariables: true },
    { id: "task_description", label: "Descrizione", type: "textarea", supportsVariables: true },
  ],
  delay: [
    { id: "delay_value", label: "Durata", type: "number", required: true, defaultValue: 1 },
    { id: "delay_unit", label: "Unità", type: "select", required: true, options: [{ value: "minutes", label: "Minuti" }, { value: "hours", label: "Ore" }, { value: "days", label: "Giorni" }], defaultValue: "hours" },
  ],
  if_else: [
    { id: "condition_field", label: "Campo", type: "text", required: true },
    { id: "condition_operator", label: "Operatore", type: "select", required: true, options: [{ value: "equals", label: "Uguale a" }, { value: "not_equals", label: "Diverso da" }, { value: "contains", label: "Contiene" }, { value: "gt", label: ">" }, { value: "lt", label: "<" }] },
    { id: "condition_value", label: "Valore", type: "text", supportsVariables: true },
  ],
  webhook_out: [
    { id: "webhook_url", label: "URL", type: "text", required: true, placeholder: "https://..." },
    { id: "webhook_method", label: "Metodo", type: "select", options: [{ value: "POST", label: "POST" }, { value: "GET", label: "GET" }, { value: "PUT", label: "PUT" }], defaultValue: "POST" },
  ],
  external_api: [
    { id: "api_url", label: "URL API", type: "text", required: true },
    { id: "api_method", label: "Metodo", type: "select", options: [{ value: "POST", label: "POST" }, { value: "GET", label: "GET" }] },
  ],
  call_with_ai_agent: [
    { id: "ai_agent_id", label: "Agente AI", type: "select", required: true },
  ],
  update_contact_score: [
    { id: "score_operation", label: "Operazione", type: "select", options: [{ value: "add", label: "Aggiungi" }, { value: "subtract", label: "Sottrai" }, { value: "set", label: "Imposta" }], defaultValue: "add" },
    { id: "score_value", label: "Valore", type: "number", required: true },
  ],
};

// ── Build catalog ──

function buildTriggerCatalog(): CatalogItem[] {
  return TRIGGER_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({
      id: item.id,
      label: item.label,
      description: TRIGGER_DESCRIPTIONS[item.id] ?? item.description,
      icon: item.icon,
      category: cat.key,
      categoryLabel: cat.label,
      kind: "trigger" as FlowNodeKind,
    }))
  );
}

function buildActionCatalog(): CatalogItem[] {
  return ACTION_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({
      id: item.id,
      label: item.label,
      description: ACTION_DESCRIPTIONS[item.id] ?? item.description,
      icon: item.icon,
      category: cat.key,
      categoryLabel: cat.label,
      kind: kindFromActionId(item.id),
      configSchema: ACTION_CONFIG_SCHEMAS[item.id],
    }))
  );
}

export const TRIGGER_CATALOG: CatalogItem[] = buildTriggerCatalog();
export const ACTION_CATALOG: CatalogItem[] = buildActionCatalog();
export const FULL_CATALOG: CatalogItem[] = [...TRIGGER_CATALOG, ...ACTION_CATALOG];

// Note item (special — not from existing catalogs)
export const NOTE_CATALOG_ITEM: CatalogItem = {
  id: "note",
  label: "Nota",
  description: "Aggiungi una nota visiva al canvas",
  icon: "StickyNote",
  category: "utility",
  categoryLabel: "Utilità",
  kind: "note",
};

export function getCatalogItem(itemId: string): CatalogItem | undefined {
  if (itemId === "note") return NOTE_CATALOG_ITEM;
  return FULL_CATALOG.find((c) => c.id === itemId);
}

// ── Node kind colors (semantic) ──

export const NODE_KIND_STYLES: Record<FlowNodeKind, { bg: string; border: string; accent: string; label: string }> = {
  trigger: { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-400", accent: "text-emerald-600", label: "Trigger" },
  action: { bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-400", accent: "text-indigo-600", label: "Azione" },
  condition: { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-400", accent: "text-amber-600", label: "Condizione" },
  delay: { bg: "bg-sky-50 dark:bg-sky-950/40", border: "border-sky-400", accent: "text-sky-600", label: "Attesa" },
  goal: { bg: "bg-green-50 dark:bg-green-950/40", border: "border-green-500", accent: "text-green-600", label: "Obiettivo" },
  split: { bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-400", accent: "text-teal-600", label: "Split" },
  note: { bg: "bg-yellow-50 dark:bg-yellow-950/40", border: "border-yellow-300", accent: "text-yellow-700", label: "Nota" },
};
