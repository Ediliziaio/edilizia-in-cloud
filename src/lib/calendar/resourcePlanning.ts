import { format } from "date-fns";
import { buildCalendarEvents, type CalendarEvent } from "./events";
import { calendarEventKey } from "./eventDetails";
import type { CalendarOrder } from "@/types/calendar";

export type PlanningResource = { id: string; name: string };
export type ResourcePlanningRow = PlanningResource & {
  cells: Map<string, CalendarEvent[]>;
  days: number;
  orders: number;
};

/** Un solo modello per la settimana delle squadre e il carico mensile. */
export function planningResourceRows(
  orders: CalendarOrder[],
  days: Date[],
  kind: "employee" | "team",
  catalog: PlanningResource[] = [],
): ResourcePlanningRow[] {
  const rows = new Map<
    string,
    PlanningResource & { cells: Map<string, Map<string, CalendarEvent>> }
  >();
  for (const resource of catalog)
    rows.set(resource.id, { ...resource, cells: new Map() });
  const events = buildCalendarEvents(days, {
    orders,
    hiddenEventTypes: new Set(["merce"]),
  });
  for (const [day, entries] of events) {
    for (const event of entries) {
      if (!event.order) continue;
      const filter = event.order.planning_resource_filter;
      for (const booking of event.work?.resources ??
        event.order.resource_bookings ??
        []) {
        if (
          booking.resourceType !== kind ||
          booking.start_date > day ||
          booking.end_date < day ||
          (filter &&
            !(
              kind === "employee" ? filter.employeeIds : filter.teamIds
            ).includes(booking.resourceId))
        )
          continue;
        let row = rows.get(booking.resourceId);
        if (!row) {
          row = {
            id: booking.resourceId,
            name: booking.resourceName,
            cells: new Map(),
          };
          rows.set(row.id, row);
        }
        const cell = row.cells.get(day) ?? new Map<string, CalendarEvent>();
        const work = event.work
          ? {
              ...event.work,
              name: event.work.phase_id
                ? event.work.name
                : booking.phase_name || event.work.name,
              ...(booking.start_time || booking.end_time
                ? { start_time: booking.start_time, end_time: booking.end_time }
                : {}),
            }
          : undefined;
        const entry = work ? { ...event, work } : event;
        if (!cell.has(calendarEventKey(entry)))
          cell.set(calendarEventKey(entry), entry);
        row.cells.set(day, cell);
      }
    }
  }
  return [...rows.values()]
    .map((row) => {
      const cells = new Map(
        [...row.cells].map(([day, entries]) => [day, [...entries.values()]]),
      );
      return {
        id: row.id,
        name: row.name,
        cells,
        days: cells.size,
        orders: new Set([...cells.values()].flat().map((e) => e.order!.id))
          .size,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

export const resourceCellCount = (events: CalendarEvent[] = []) =>
  new Set(events.map((e) => e.order?.id).filter(Boolean)).size;

export function resourceDayEvents(rows: ResourcePlanningRow[], date: Date) {
  const result = new Map<string, CalendarEvent>();
  for (const row of rows)
    for (const event of row.cells.get(format(date, "yyyy-MM-dd")) ?? []) {
      result.set(calendarEventKey(event), event);
    }
  return [...result.values()];
}

/** Fasce relative al picco visibile: un mese intenso non diventa un unico colore. */
export function workloadBands(peak: number) {
  const levels = Math.min(4, Math.max(0, peak));
  return [
    { min: 0, max: 0, label: "0", level: 0 },
    ...Array.from({ length: levels }, (_, i) => {
      const min = Math.ceil((peak * i) / levels) + 1,
        max = Math.ceil((peak * (i + 1)) / levels);
      return {
        min,
        max,
        label: min === max ? String(min) : `${min}–${max}`,
        level: i + 1,
      };
    }),
  ];
}
