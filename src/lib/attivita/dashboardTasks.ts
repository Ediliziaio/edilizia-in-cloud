import { format, addDays } from "date-fns";
import { isTaskBlockedStatus, isTaskDoneStatus, type TaskStatusDefinition } from "@/lib/taskStatuses";

export type DashboardTaskFilter = "tutte" | "oggi" | "scadute" | "settimana" | "senza-data" | "completate";
export interface DashboardTask {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  category: string | null;
  assigned_to: string | null;
  created_by: string | null;
  order_id: string | null;
  stock_item_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  completed_at: string | null;
  order: { order_code: string | null } | null;
  stock_item: { name: string | null } | null;
  contatto: { id: string; first_name: string | null; last_name: string | null } | null;
  opportunita: { id: string; name: string | null } | null;
  assignee: { first_name: string | null; last_name: string | null } | null;
}

export const dashboardDateKey = (date: string | null | undefined) => date?.slice(0, 10) || null;
export function dashboardTasksForAssignee<T extends Pick<DashboardTask, "assigned_to">>(tasks: T[], assignee: string, userId?: string, seesTeam = false) {
  if (!seesTeam || assignee === "me") return tasks.filter(t => t.assigned_to === userId);
  return assignee === "all" ? tasks : tasks.filter(t => t.assigned_to === assignee);
}

type TaskForFilters = Pick<DashboardTask, "id" | "title" | "notes" | "category" | "status" | "due_date" | "priority">;
export function isDashboardTaskOverdue(task: Pick<DashboardTask, "status" | "due_date">, today: Date, statuses?: TaskStatusDefinition[]) {
  const due = dashboardDateKey(task.due_date);
  return !!due && due < format(today, "yyyy-MM-dd") && !isTaskDoneStatus(task.status, statuses) && !isTaskBlockedStatus(task.status, statuses);
}

export function dashboardTaskStats(tasks: TaskForFilters[], today: Date, statuses?: TaskStatusDefinition[]) {
  const key = format(today, "yyyy-MM-dd");
  const end = format(addDays(today, 6), "yyyy-MM-dd");
  const active = tasks.filter(t => !isTaskDoneStatus(t.status, statuses));
  const actionable = active.filter(t => !isTaskBlockedStatus(t.status, statuses));
  return {
    total: active.length,
    today: actionable.filter(t => dashboardDateKey(t.due_date) === key).length,
    overdue: actionable.filter(t => isDashboardTaskOverdue(t, today, statuses)).length,
    week: actionable.filter(t => t.due_date && dashboardDateKey(t.due_date)! >= key && dashboardDateKey(t.due_date)! <= end).length,
    undated: actionable.filter(t => !t.due_date).length,
    completed: tasks.length - active.length,
  };
}

/** Il giorno selezionato sostituisce solo il filtro temporale, mai persona e ricerca. */
export function filterDashboardTasks<T extends TaskForFilters>(tasks: T[], filter: DashboardTaskFilter, today: Date, search = "", selectedDate?: string | null, statuses?: TaskStatusDefinition[]): T[] {
  const key = format(today, "yyyy-MM-dd");
  const end = format(addDays(today, 6), "yyyy-MM-dd");
  const query = search.trim().toLocaleLowerCase("it");
  const priority = { urgente: 0, alta: 1, normale: 2, bassa: 3 };
  return tasks.filter(t => {
    const done = isTaskDoneStatus(t.status, statuses);
    const blocked = isTaskBlockedStatus(t.status, statuses);
    const due = dashboardDateKey(t.due_date);
    if (selectedDate) {
      if (done || due !== selectedDate) return false;
    } else if (filter === "completate") {
      if (!done) return false;
    } else {
      if (done) return false;
      if (filter !== "tutte" && blocked) return false;
      if (filter === "oggi" && due !== key) return false;
      if (filter === "scadute" && (!due || due >= key)) return false;
      if (filter === "settimana" && (!due || due < key || due > end)) return false;
      if (filter === "senza-data" && due) return false;
    }
    return !query || [t.title, t.notes, t.category].some(v => v?.toLocaleLowerCase("it").includes(query));
  }).sort((a, b) => {
    const aDate = dashboardDateKey(a.due_date);
    const bDate = dashboardDateKey(b.due_date);
    const overdue = Number(!!bDate && bDate < key) - Number(!!aDate && aDate < key);
    return overdue || (priority[a.priority as keyof typeof priority] ?? 2) - (priority[b.priority as keyof typeof priority] ?? 2)
      || (aDate ?? "9999").localeCompare(bDate ?? "9999") || a.title.localeCompare(b.title, "it") || a.id.localeCompare(b.id);
  });
}

export function dashboardTaskDateGroup(task: TaskForFilters, today: Date, statuses?: TaskStatusDefinition[]) {
  if (isTaskDoneStatus(task.status, statuses)) return "Completate";
  if (isTaskBlockedStatus(task.status, statuses)) return "In attesa";
  const due = dashboardDateKey(task.due_date);
  const key = format(today, "yyyy-MM-dd");
  if (!due) return "Senza data";
  if (due < key) return "Scadute";
  if (due === key) return "Oggi";
  return due <= format(addDays(today, 6), "yyyy-MM-dd") ? "Prossimi 7 giorni" : "Più avanti";
}

/** Legge anche oltre il limite REST, con ordine stabile e senza risultati parziali. */
export async function loadDashboardRows<T extends { id: string }>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  for (let from = 0; ; from += 250) {
    const { data, error } = await load(from, from + 249);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      if (ids.has(row.id)) throw new Error("I dati sono cambiati durante il caricamento. Riprova.");
      ids.add(row.id);
      rows.push(row);
    }
    if (page.length < 250) return rows;
  }
}
