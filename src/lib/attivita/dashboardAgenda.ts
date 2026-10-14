import { eachDayOfInterval, format, isValid, parseISO } from "date-fns";
import { isTaskDoneStatus, type TaskStatusDefinition } from "@/lib/taskStatuses";
import { dashboardDateKey, type DashboardTask } from "./dashboardTasks";

export const AGENDA_LAYERS = {
  task: { label: "Attività aperte", dot: "bg-blue-500", tone: "border-blue-200 bg-blue-50 text-blue-700", singular: "Attività" },
  order: { label: "Le mie commesse", dot: "bg-emerald-500", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", singular: "Commessa assegnata" },
  deadline: { label: "Incassi e pagamenti", dot: "bg-amber-500", tone: "border-amber-200 bg-amber-50 text-amber-800", singular: "Scadenza economica" },
  appointment: { label: "I miei appuntamenti", dot: "bg-teal-500", tone: "border-teal-200 bg-teal-50 text-teal-700", singular: "Appuntamento assegnato" },
  leave: { label: "Le mie assenze", dot: "bg-orange-400", tone: "border-orange-200 bg-orange-50 text-orange-700", singular: "Assenza personale" },
  holiday: { label: "Chiusure aziendali", dot: "bg-red-400", tone: "border-red-200 bg-red-50 text-red-700", singular: "Chiusura aziendale" },
} as const;
export type AgendaLayer = keyof typeof AGENDA_LAYERS;
export type ToggleAgendaLayer = Exclude<AgendaLayer, "holiday">;
export interface AgendaItem { id: string; layer: AgendaLayer; date: string; title: string; time?: string; href?: string; taskId?: string }
export interface AgendaOrder { id: string; order_code: string | null; description: string | null; work_start_date: string | null; work_end_date: string | null; expected_date: string | null; warehouse_arrival_date: string | null }
export interface AgendaDeadline { id: string; description: string | null; due_date: string; tipo: string; status: string; direction?: string | null }
export interface AgendaAppointment { id: string; title: string | null; appointment_date: string; appointment_time: string | null; status: string; assigned_to?: string | null }
export interface AgendaLeave { id: string; tipo: string; data_inizio: string; data_fine: string; user_id?: string | null; profilo: { nome: string | null; cognome: string | null; user_id?: string | null } | null }
export interface AgendaHoliday { id: string; data: string; descrizione: string; ricorrente: boolean }

const closedAppointments = new Set(["annullato", "annullata", "cancellato", "cancellata", "cancelled", "canceled", "completato", "completata", "completed", "no_show"]);
export function readAgendaLayers(value: string | null): Set<ToggleAgendaLayer> {
  const defaults: ToggleAgendaLayer[] = ["task", "order", "appointment", "leave"];
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is ToggleAgendaLayer => defaults.includes(v as ToggleAgendaLayer)));
  } catch { /* Preferenze corrotte: riparti dalle fonti disponibili. */ }
  return new Set(defaults);
}

export function buildDashboardAgenda({ tasks, orders, deadlines, appointments, leaves, holidays, from, to, statuses }:
  { tasks: Pick<DashboardTask, "id" | "title" | "status" | "due_date">[]; orders: AgendaOrder[]; deadlines: AgendaDeadline[]; appointments: AgendaAppointment[]; leaves: AgendaLeave[]; holidays: AgendaHoliday[]; from: string; to: string; statuses?: TaskStatusDefinition[] }) {
  const items = new Map<string, AgendaItem[]>();
  const poses = new Map<string, number>();
  const add = (item: AgendaItem) => {
    if (item.date < from || item.date > to || !isValid(parseISO(item.date))) return;
    items.set(item.date, [...(items.get(item.date) ?? []), item]);
  };
  const daysIn = (start: string | null, end: string | null) => {
    const a = start && start > from ? start : from;
    const b = end && end < to ? end : to;
    if (!start || !end || a > b || !isValid(parseISO(a)) || !isValid(parseISO(b))) return [];
    return eachDayOfInterval({ start: parseISO(a), end: parseISO(b) }).map(d => format(d, "yyyy-MM-dd"));
  };
  for (const task of tasks) {
    const date = dashboardDateKey(task.due_date);
    if (date && !isTaskDoneStatus(task.status, statuses)) add({ id: `task:${task.id}`, taskId: task.id, layer: "task", date, title: task.title });
  }
  for (const order of orders) {
    const label = [order.order_code, order.description].filter(Boolean).join(" · ");
    for (const [date, title] of [[order.work_start_date, "Inizio posa"], [order.work_end_date, "Fine posa"], [order.expected_date, "Consegna prevista"], [order.warehouse_arrival_date, "Arrivo in magazzino"]]) {
      if (date) add({ id: `order:${order.id}:${title}`, layer: "order", date, title: `${title} · ${label || "Commessa"}`, href: `/azienda/ordini/${order.id}` });
    }
    for (const date of daysIn(order.work_start_date, order.work_end_date)) poses.set(date, (poses.get(date) ?? 0) + 1);
  }
  for (const deadline of deadlines) if (!["annullata", "pagata"].includes(deadline.status)) {
    add({ id: `deadline:${deadline.id}`, layer: "deadline", date: deadline.due_date, title: `${deadline.direction === "entrata" || ["entrata", "incasso_cliente"].includes(deadline.tipo) ? "Incasso" : deadline.tipo === "scadenza_fiscale" ? "Scadenza fiscale" : deadline.direction === "uscita" || ["uscita", "pagamento_fornitore", "costo_aziendale"].includes(deadline.tipo) ? "Pagamento" : "Scadenza"} · ${deadline.description || "Da verificare"}`, href: "/azienda/scadenzario" });
  }
  for (const appointment of appointments) if (!closedAppointments.has(appointment.status)) {
    add({ id: `appointment:${appointment.id}`, layer: "appointment", date: appointment.appointment_date, time: appointment.appointment_time?.slice(0, 5), title: appointment.title || "Appuntamento", href: "/azienda/marketing/calendario" });
  }
  for (const leave of leaves) {
    const name = [leave.profilo?.nome, leave.profilo?.cognome].filter(Boolean).join(" ");
    const kind = leave.tipo === "ferie" ? "Ferie" : leave.tipo === "permesso" ? "Permesso" : "Assenza approvata";
    for (const date of daysIn(leave.data_inizio, leave.data_fine)) add({ id: `leave:${leave.id}:${date}`, layer: "leave", date, title: [kind, name].filter(Boolean).join(" · ") });
  }
  for (const holiday of holidays) {
    const years = new Set([from.slice(0, 4), to.slice(0, 4)]);
    for (const year of holiday.ricorrente ? years : [holiday.data.slice(0, 4)]) {
      const date = holiday.ricorrente ? `${year}-${holiday.data.slice(5)}` : holiday.data;
      add({ id: `holiday:${holiday.id}:${date}`, layer: "holiday", date, title: holiday.descrizione });
    }
  }
  for (const day of items.values()) day.sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title, "it") || a.id.localeCompare(b.id));
  return { items, poses };
}
