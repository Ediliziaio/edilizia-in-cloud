import type { CalendarViewType } from "@/types/calendar";

export const calendarPlanningViews = ["gantt", "teams", "heatmap"] as const;
export const isCalendarPlanningView = (view: CalendarViewType) =>
  (calendarPlanningViews as readonly string[]).includes(view);

export function normalizeCalendarView(
  value: string | null | undefined,
  mobile: boolean,
  canViewTeam: boolean,
): CalendarViewType {
  const views = ["month", "week", "day", "agenda", ...calendarPlanningViews];
  if (!value || !views.includes(value)) return "month";
  if (value === "teams" && !canViewTeam) return "month";
  if (mobile && value !== "month" && value !== "agenda") return "month";
  return value as CalendarViewType;
}
