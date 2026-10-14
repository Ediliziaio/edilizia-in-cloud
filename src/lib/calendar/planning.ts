import {
  addDays,
  endOfMonth,
  endOfWeek,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfQuarter,
  startOfYear,
  isValid,
  parseISO,
} from "date-fns";
import type {
  CalendarAppointment,
  CalendarOrder,
  CalendarResourceBooking,
  CalendarViewType,
  CalendarWorkPhase,
  CalendarWorkPeriod,
  GanttZoom,
} from "@/types/calendar";

const validRange = (
  start: string | null | undefined,
  end: string | null | undefined,
) =>
  !!start &&
  isValid(parseISO(start)) &&
  isValid(parseISO(end || start)) &&
  (end || start) >= start;

type Phase = {
  id?: string;
  start_date: string | null;
  end_date: string | null;
  name: string | null;
};
type EmployeeLink = NonNullable<CalendarOrder["order_employees"]>[number] & {
  phase_id?: string | null;
  phase?: Phase | null;
};
type TeamLink = NonNullable<CalendarOrder["order_external_teams"]>[number] & {
  phase_id?: string | null;
  phase?: Phase | null;
};
export type RawPlanningOrder = CalendarOrder & {
  order_work_phases?: CalendarWorkPhase[];
  order_employees?: EmployeeLink[];
  order_external_teams?: TeamLink[];
  squadre_commesse?: {
    dal: string | null;
    al: string | null;
    phase_id?: string | null;
    squadra: TeamLink["external_team"] | null;
    phase?: Phase | null;
  }[];
};
export function calendarPeriod(
  date: Date,
  view: CalendarViewType,
  zoom: GanttZoom = "quarter",
) {
  if (view === "agenda")
    return {
      from: format(date, "yyyy-MM-dd"),
      to: format(addDays(date, 6), "yyyy-MM-dd"),
    };
  if (view === "gantt") {
    const start =
      zoom === "year"
        ? startOfYear(date)
        : zoom === "quarter"
          ? startOfQuarter(date)
          : startOfMonth(date);
    const end =
      zoom === "year"
        ? endOfYear(date)
        : zoom === "quarter"
          ? endOfQuarter(date)
          : endOfMonth(date);
    return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
  }
  const start =
    view === "day"
      ? date
      : view === "week" || view === "teams"
        ? startOfWeek(date, { weekStartsOn: 1 })
        : startOfMonth(date);
  const end =
    view === "day"
      ? date
      : view === "week" || view === "teams"
        ? endOfWeek(date, { weekStartsOn: 1 })
        : endOfMonth(date);
  return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
}
export function orderInCalendarPeriod(
  order: CalendarOrder,
  from: string,
  to: string,
  sources = { work: true, installation: true, warehouse: true },
) {
  const at = (date: string | null) => !!date && date >= from && date <= to;
  return (
    (sources.installation && at(order.expected_date)) ||
    (sources.warehouse && at(order.warehouse_arrival_date)) ||
    (sources.work &&
      getOrderWorkPeriods(order).some(
        (p) => p.start_date <= to && p.end_date >= from,
      ))
  );
}
/** Nomi unici per filtri e conteggi, tutte le prenotazioni per controllare le sovrapposizioni. */
export function normalizePlanningOrder(raw: RawPlanningOrder): CalendarOrder {
  const bookings: CalendarResourceBooking[] = [];
  const add = (
    resourceId: string,
    resourceName: string,
    resourceType: "employee" | "team",
    start: string | null,
    end: string | null,
    phase?: string | null,
    timed = false,
    phaseId?: string | null,
  ) => {
    if (!start || !validRange(start, end)) return;
    const finish = end || start;
    bookings.push({
      resourceId,
      resourceName,
      resourceType,
      start_date: start,
      end_date: finish,
      phase_name: phase,
      phase_id: phaseId,
      start_time: timed ? raw.work_start_time : null,
      end_time: timed ? raw.work_end_time : null,
    });
  };
  const general = (id: string, name: string, type: "employee" | "team") => {
    add(
      id,
      name,
      type,
      raw.work_start_date || raw.expected_date,
      raw.work_end_date,
      null,
      true,
    );
    if (
      raw.expected_date &&
      (!raw.work_start_date ||
        raw.expected_date < raw.work_start_date ||
        raw.expected_date > (raw.work_end_date || raw.work_start_date))
    )
      add(id, name, type, raw.expected_date, raw.expected_date);
  };
  const employees = new Map<string, EmployeeLink>();
  for (const link of raw.order_employees ?? []) {
    if (!link.employee?.id) continue;
    const e = link.employee;
    employees.set(e.id, link);
    const name =
      [e.first_name, e.last_name].filter(Boolean).join(" ") || "Operatore";
    if (link.phase_id)
      add(
        e.id,
        name,
        "employee",
        link.phase?.start_date ?? null,
        link.phase?.end_date ?? null,
        link.phase?.name,
        false,
        link.phase_id,
      );
    else general(e.id, name, "employee");
  }
  const teams = new Map<string, TeamLink>();
  for (const link of raw.order_external_teams ?? []) {
    if (!link.external_team?.id) continue;
    const t = link.external_team;
    teams.set(t.id, link);
    const canonical = (raw.squadre_commesse ?? []).some(
      (s) =>
        s.squadra?.id === t.id &&
        (!link.phase_id || (s.phase_id || s.phase?.id) === link.phase_id) &&
        validRange(s.dal || s.phase?.start_date, s.al || s.phase?.end_date),
    );
    if (canonical) continue;
    if (link.phase_id)
      add(
        t.id,
        t.name,
        "team",
        link.phase?.start_date ?? null,
        link.phase?.end_date ?? null,
        link.phase?.name,
        false,
        link.phase_id,
      );
    else general(t.id, t.name, "team");
  }
  for (const link of raw.squadre_commesse ?? []) {
    if (!link.squadra?.id) continue;
    const t = link.squadra;
    teams.set(t.id, { external_team: t });
    const phaseId = link.phase_id || link.phase?.id;
    const from = link.dal || link.phase?.start_date;
    const to = link.al || link.phase?.end_date || from;
    if (
      !phaseId &&
      bookings.some(
        (b) =>
          b.resourceType === "team" &&
          b.resourceId === t.id &&
          b.start_date === from &&
          b.end_date === to,
      )
    )
      continue;
    add(
      t.id,
      t.name,
      "team",
      link.dal || link.phase?.start_date || null,
      link.al || link.phase?.end_date || null,
      link.phase?.name,
      false,
      link.phase_id || link.phase?.id,
    );
  }
  const unique = new Map(
    bookings.map((b) => [
      JSON.stringify([
        b.resourceType,
        b.resourceId,
        b.phase_id,
        b.start_date,
        b.end_date,
        b.start_time,
        b.end_time,
      ]),
      b,
    ]),
  );
  return {
    ...raw,
    customer: raw.customer ?? {
      first_name: "",
      last_name: "Cliente non associato",
    },
    order_employees: [...employees.values()].map(({ employee }) => ({
      employee,
    })),
    order_external_teams: [...teams.values()].map(({ external_team }) => ({
      external_team,
    })),
    resource_bookings: [...unique.values()],
    work_phases: raw.order_work_phases ?? raw.work_phases,
  };
}

/** Le fasi sono la pianificazione; le date generali servono solo alle commesse senza fasi. */
export function getOrderWorkPeriods(
  order: CalendarOrder,
): CalendarWorkPeriod[] {
  const bookings = order.resource_bookings ?? [];
  const periods: CalendarWorkPeriod[] = order.work_phases?.length
    ? order.work_phases
        .filter((p) => validRange(p.start_date, p.end_date))
        .sort((a, b) => a.position - b.position)
        .map((p) => ({
          id: p.id,
          phase_id: p.id,
          name: p.name,
          start_date: p.start_date!,
          end_date: p.end_date || p.start_date!,
          status: p.status,
          ...(p.notes != null ? { phase_notes: p.notes } : {}),
          ...(p.percentuale != null ? { progress: p.percentuale } : {}),
          ...(p.completata_il != null
            ? { completed_date: p.completata_il }
            : {}),
          resources: bookings.filter(
            (b) =>
              b.phase_id === p.id ||
              (!b.phase_id &&
                b.start_date <= (p.end_date || p.start_date!) &&
                b.end_date >= p.start_date!),
          ),
        }))
    : validRange(order.work_start_date, order.work_end_date)
      ? [
          {
            id: order.id,
            name: "Lavori · date della commessa",
            start_date: order.work_start_date!,
            end_date: order.work_end_date || order.work_start_date!,
            start_time: order.work_start_time,
            end_time: order.work_end_time,
            resources: bookings,
          },
        ]
      : [];
  if (!order.planning_resource_filter) return periods;
  const filter = order.planning_resource_filter;
  return periods.flatMap((period) => {
    const resources = period.resources.filter((b) =>
      (b.resourceType === "employee"
        ? filter.employeeIds
        : filter.teamIds
      ).includes(b.resourceId),
    );
    const windows = new Map<string, CalendarWorkPeriod>();
    for (const booking of resources) {
      const from =
        booking.start_date > period.start_date
          ? booking.start_date
          : period.start_date;
      const to =
        booking.end_date < period.end_date ? booking.end_date : period.end_date;
      if (from <= to)
        windows.set(`${from}:${to}`, {
          ...period,
          id: `${period.id}:${from}:${to}`,
          start_date: from,
          end_date: to,
          resources,
        });
    }
    return [...windows.values()];
  });
}
export function filterPlanningAppointments(
  appointments: CalendarAppointment[],
  work: boolean,
  marketing: boolean,
  assignee = "all",
  search = "",
) {
  const term = search.trim().toLocaleLowerCase();
  return appointments.filter((a) => {
    if (
      [
        "annullato",
        "annullata",
        "cancelled",
        "canceled",
        "cancellato",
        "cancellata",
        "no_show",
      ].includes(a.status ?? "")
    )
      return false;
    const isMarketing = !a.order_id && !!a.calendar_id;
    if (isMarketing ? !marketing : !work) return false;
    return (
      (assignee === "all" || a.assigned_to === assignee) &&
      (!term ||
        [
          a.title,
          a.description,
          a.order?.order_code,
          a.contact?.first_name,
          a.contact?.last_name,
          a.assigned_profile?.first_name,
          a.assigned_profile?.last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(term))
    );
  });
}

/** Il carico individuale segue le fasi, senza occupare ogni persona per tutta la commessa. */
export function employeeAssignedOnDate(
  order: CalendarOrder,
  employeeId: string,
  date: string,
) {
  if (order.resource_bookings)
    return order.resource_bookings.some(
      (b) =>
        b.resourceType === "employee" &&
        b.resourceId === employeeId &&
        b.start_date <= date &&
        b.end_date >= date,
    );
  if (!order.order_employees?.some((link) => link.employee?.id === employeeId))
    return false;
  return (
    order.expected_date === date ||
    (!!order.work_start_date &&
      order.work_start_date <= date &&
      (order.work_end_date || order.work_start_date) >= date)
  );
}
