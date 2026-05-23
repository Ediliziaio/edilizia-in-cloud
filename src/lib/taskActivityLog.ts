import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export const TASK_FIELD_LABELS: Record<string, string> = {
  title: "titolo",
  notes: "note",
  status: "stato",
  priority: "priorità",
  due_date: "scadenza",
  assigned_to: "assegnatario",
  category: "categoria",
  estimated_hours: "stima ore",
  order_id: "ordine collegato",
  stock_item_id: "articolo magazzino",
  cost_id: "costo collegato",
  contact_id: "contatto collegato",
  opportunity_id: "opportunità collegata",
  ticket_id: "ticket collegato",
  is_recurring: "ripetizione",
  recurrence_rule: "regola ripetizione",
  recurrence_end_date: "fine ripetizione",
  completed_at: "completamento",
};

type TaskActivityParams = {
  companyId?: string | null;
  userId?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  eventType: string;
  description: string;
  changes?: Record<string, unknown> | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  importance?: "low" | "normal" | "high" | "critical";
};

export function describeTaskChanges(changes?: Record<string, unknown> | null) {
  const keys = Object.keys(changes ?? {}).filter((key) => key !== "updated_at");
  if (keys.length === 0) return "ha modificato l'attività";
  const labels = keys.slice(0, 4).map((key) => TASK_FIELD_LABELS[key] ?? key);
  const suffix = keys.length > labels.length ? ` e altri ${keys.length - labels.length}` : "";
  return `ha modificato ${labels.join(", ")}${suffix}`;
}

export async function logTaskActivity({
  companyId,
  userId,
  taskId,
  taskTitle,
  eventType,
  description,
  changes,
  beforeSnapshot,
  afterSnapshot,
  metadata,
  importance = "normal",
}: TaskActivityParams) {
  if (!companyId || !userId || !taskId) return;

  const { error } = await supabase.rpc("log_activity", {
    p_company_id: companyId,
    p_category: "modification",
    p_event_type: eventType,
    p_actor_user_id: userId,
    p_target_table: "tasks",
    p_target_id: taskId,
    p_target_label: taskTitle || "Attività",
    p_description: description,
    p_changes: changes ?? null,
    p_before_snapshot: beforeSnapshot ?? null,
    p_after_snapshot: afterSnapshot ?? null,
    p_importance: importance,
    p_metadata: metadata ?? {},
    p_source_function: "web:tasks",
  });

  if (error) {
    logger.warn("Task activity log non salvato", error);
  }
}
