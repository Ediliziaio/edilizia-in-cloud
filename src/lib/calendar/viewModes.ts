import type { CalendarViewType } from "@/types/calendar";

export const calendarPlanningViews = ["gantt", "teams", "heatmap"] as const;
export const isCalendarPlanningView = (view: CalendarViewType) =>
  (calendarPlanningViews as readonly string[]).includes(view);

/**
 * La vista con cui si apre il calendario. Da telefono l'agenda dei prossimi giorni da oggi:
 * con la griglia del mese gli appuntamenti di oggi stavano sotto la griglia, fuori schermo, e
 * chi esce per un appuntamento deve vederlo subito (collaudo 23/11/2026). Da computer il mese.
 */
export const vistaPredefinita = (mobile: boolean): CalendarViewType => (mobile ? "agenda" : "month");

export function normalizeCalendarView(
  value: string | null | undefined,
  mobile: boolean,
  canViewTeam: boolean,
): CalendarViewType {
  const views = ["month", "week", "day", "agenda", ...calendarPlanningViews];
  if (!value || !views.includes(value)) return vistaPredefinita(mobile);
  if (value === "teams" && !canViewTeam) return vistaPredefinita(mobile);
  if (mobile && value !== "month" && value !== "agenda") return vistaPredefinita(mobile);
  return value as CalendarViewType;
}
