import { format, parseISO, startOfDay } from "date-fns";
import { getOrderWorkPeriods } from "@/lib/calendar/planning";
import { calendarEventDate } from "@/lib/calendar/eventDetails";
import {
  DEFAULT_CALENDAR_EVENT_COLORS,
  type CalendarEventColors,
} from "@/lib/calendarUtils";
import type {
  ApprovedLeave,
  CalendarAppointment,
  CalendarIntervento,
  CalendarManutenzione,
  CalendarOrder,
  CalendarWorkPeriod,
  GoogleBusySlot,
} from "@/types/calendar";

export interface CalendarEvent {
  type:
    | "posa"
    | "merce"
    | "lavoro"
    | "appointment"
    | "google_busy"
    | "leave"
    | "intervento"
    | "manutenzione";
  order?: CalendarOrder;
  work?: CalendarWorkPeriod;
  appointment?: CalendarAppointment;
  busySlot?: GoogleBusySlot;
  leave?: ApprovedLeave;
  intervento?: CalendarIntervento;
  manutenzione?: CalendarManutenzione;
  color: string;
}
interface EventSources {
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  approvedLeaves?: ApprovedLeave[];
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
  hiddenEventTypes?: Set<string>;
  eventColors?: CalendarEventColors;
  orderColorFn?: (order: CalendarOrder) => string;
}
/** Un solo calendario di eventi per mese e agenda, con intervalli limitati alla vista. */
export function buildCalendarEvents(days: Date[], sources: EventSources) {
  const {
    orders,
    appointments = [],
    busySlots = [],
    approvedLeaves = [],
    interventi = [],
    manutenzioni = [],
    hiddenEventTypes = new Set(),
    eventColors = DEFAULT_CALENDAR_EVENT_COLORS,
    orderColorFn,
  } = sources;
  const map = new Map<string, CalendarEvent[]>();
  if (!days.length) return map;
  const from = format(days[0], "yyyy-MM-dd"),
    to = format(days[days.length - 1], "yyyy-MM-dd");
  const add = (date: string, event: CalendarEvent) => {
    const key = date.slice(0, 10);
    if (key < from || key > to) return;
    const events = map.get(key) ?? [];
    // Più assegnazioni della stessa fase possono sovrapporsi: una sola voce al giorno.
    const identity = (e: CalendarEvent) =>
      `${e.type}:${e.order?.id || e.appointment?.id || e.busySlot?.id || e.leave?.id || e.intervento?.id || e.manutenzione?.id}:${e.work?.phase_id || ""}`;
    if (!events.some((e) => identity(e) === identity(event)))
      events.push(event);
    map.set(key, events);
  };
  const range = (
    start: Date,
    end: Date,
    event: CalendarEvent,
    skip: string[] = [],
  ) => {
    const first = startOfDay(start),
      last = startOfDay(end);
    const windowStart = startOfDay(days[0]),
      windowEnd = startOfDay(days[days.length - 1]);
    const cursor = new Date(first < windowStart ? windowStart : first);
    const finish = last > windowEnd ? windowEnd : last;
    while (cursor <= finish) {
      const key = format(cursor, "yyyy-MM-dd");
      if (!skip.includes(key)) add(key, event);
      cursor.setDate(cursor.getDate() + 1);
    }
  };
  for (const order of orders) {
    const posa = !hiddenEventTypes.has("posa") ? order.expected_date : null;
    const merce = !hiddenEventTypes.has("merce")
      ? order.warehouse_arrival_date
      : null;
    if (posa) add(posa, { type: "posa", order, color: eventColors.posa });
    if (merce) add(merce, { type: "merce", order, color: eventColors.merce });
    if (!hiddenEventTypes.has("lavoro"))
      for (const work of getOrderWorkPeriods(order)) {
        const phaseOrder = work.phase_id
          ? {
              ...order,
              order_external_teams: order.order_external_teams?.filter((t) =>
                work.resources.some((b) => b.resourceId === t.external_team.id),
              ),
            }
          : order;
        range(
          parseISO(work.start_date),
          parseISO(work.end_date),
          {
            type: "lavoro",
            order,
            work,
            color: orderColorFn?.(phaseOrder) ?? eventColors.lavoro,
          },
          work.phase_id ? [] : [posa, merce].filter((d): d is string => !!d),
        );
      }
  }
  if (!hiddenEventTypes.has("appuntamento"))
    appointments.forEach((a) =>
      add(a.appointment_date, {
        type: "appointment",
        appointment: a,
        color: eventColors.appuntamento,
      }),
    );
  if (!hiddenEventTypes.has("google_busy"))
    busySlots.forEach((s) => {
      const start = parseISO(s.start_at),
        end = parseISO(s.end_at);
      if (end > start)
        range(start, new Date(end.getTime() - 1), {
          type: "google_busy",
          busySlot: s,
          color: s.team_color || eventColors.google_busy,
        });
    });
  if (!hiddenEventTypes.has("leaves"))
    approvedLeaves.forEach((l) =>
      range(parseISO(l.start_date), parseISO(l.end_date), {
        type: "leave",
        leave: l,
        color: eventColors.leave,
      }),
    );
  if (!hiddenEventTypes.has("intervento"))
    interventi.forEach((i) => {
      if (i.data_intervento_prevista)
        add(calendarEventDate(i.data_intervento_prevista), {
          type: "intervento",
          intervento: i,
          color: eventColors.intervento,
        });
    });
  if (!hiddenEventTypes.has("manutenzione"))
    manutenzioni.forEach((m) => {
      if (m.prossima_scadenza)
        add(m.prossima_scadenza, {
          type: "manutenzione",
          manutenzione: m,
          color: eventColors.manutenzione,
        });
    });
  return map;
}
