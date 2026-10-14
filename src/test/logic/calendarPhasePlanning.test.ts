import { describe, expect, it } from "vitest";
import {
  getOrderWorkPeriods,
  orderInCalendarPeriod,
  calendarPeriod,
  normalizePlanningOrder,
} from "@/lib/calendar/planning";
import { buildCalendarEvents } from "@/lib/calendar/events";
import { groupCalendarConflicts } from "@/lib/calendar/conflicts";
import type { CalendarOrder } from "@/types/calendar";
import type { ConflictEntry } from "@/hooks/useConflictDetection";
const order: CalendarOrder = {
  id: "order",
  order_code: "ORD-1",
  description: "Casa",
  expected_date: null,
  warehouse_arrival_date: null,
  work_start_date: "2026-10-01",
  work_end_date: "2026-10-31",
  created_at: "",
  customer_id: "c",
  current_status_id: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  status: null,
  work_phases: [
    {
      id: "phase",
      name: "Posa",
      start_date: "2026-10-14",
      end_date: "2026-10-15",
      position: 1,
      status: "in_corso",
    },
  ],
  resource_bookings: [
    {
      resourceId: "team",
      resourceName: "Squadra A",
      resourceType: "team",
      phase_id: "phase",
      start_date: "2026-10-15",
      end_date: "2026-10-15",
    },
  ],
};
describe("Lavorazioni reali del calendario", () => {
  it("le celle seguono le fasi e non occupano tutti i giorni della commessa", () => {
    const days = [
      new Date(2026, 9, 13),
      new Date(2026, 9, 14),
      new Date(2026, 9, 15),
      new Date(2026, 9, 16),
    ];
    const events = buildCalendarEvents(days, { orders: [order] });
    expect(events.has("2026-10-13")).toBe(false);
    expect(events.get("2026-10-14")?.[0].work?.name).toBe("Posa");
    expect(events.has("2026-10-16")).toBe(false);
    expect(orderInCalendarPeriod(order, "2026-10-16", "2026-10-20")).toBe(
      false,
    );
  });
  it("l'ora corrente non esclude il primo o l'ultimo giorno di un intervallo nell'agenda", () => {
    const days = [new Date(2026, 9, 14, 11, 42), new Date(2026, 9, 15, 11, 42)];
    const endsToday = {
      ...order,
      id: "ends-today",
      work_phases: [
        {
          ...order.work_phases![0],
          id: "ends-today-phase",
          start_date: "2026-10-13",
          end_date: "2026-10-14",
        },
      ],
    };
    const map = buildCalendarEvents(days, { orders: [order, endsToday] });
    expect(map.get("2026-10-14")).toHaveLength(2);
    expect(map.get("2026-10-15")).toHaveLength(1);
  });
  it("una fase priva di date resta da pianificare senza usare la durata generale", () => {
    expect(
      getOrderWorkPeriods({
        ...order,
        work_phases: [
          { ...order.work_phases![0], start_date: null, end_date: null },
        ],
      }),
    ).toEqual([]);
  });
  it("le fasi senza risorse restano visibili e le date generali sono il fallback solo senza fasi", () => {
    expect(
      getOrderWorkPeriods({ ...order, resource_bookings: [] })[0].resources,
    ).toEqual([]);
    expect(
      getOrderWorkPeriods({ ...order, work_phases: [] })[0].start_date,
    ).toBe("2026-10-01");
  });
  it("filtrare una squadra mostra soltanto i giorni della sua assegnazione", () => {
    const selected: CalendarOrder = {
      ...order,
      planning_resource_filter: { employeeIds: [], teamIds: ["team"] },
    };
    const periods = getOrderWorkPeriods(selected);
    expect(periods[0].start_date).toBe("2026-10-15");
    expect(periods[0].end_date).toBe("2026-10-15");
    expect(
      getOrderWorkPeriods({
        ...order,
        planning_resource_filter: { employeeIds: [], teamIds: ["other"] },
      }),
    ).toEqual([]);
  });
  it("due finestre della stessa fase non creano due voci nello stesso giorno", () => {
    const selected: CalendarOrder = {
      ...order,
      resource_bookings: [
        ...order.resource_bookings!,
        { ...order.resource_bookings![0], start_date: "2026-10-14" },
      ],
      planning_resource_filter: { employeeIds: [], teamIds: ["team"] },
    };
    expect(
      buildCalendarEvents([new Date(2026, 9, 14), new Date(2026, 9, 15)], {
        orders: [selected],
      }).get("2026-10-15"),
    ).toHaveLength(1);
  });
  it("la pianificazione canonica della squadra prevale sul collegamento economico alla fase", () => {
    const team = { id: "team", name: "Squadra A" };
    const normalized = normalizePlanningOrder({
      ...order,
      order_external_teams: [
        {
          external_team: team,
          phase_id: "phase",
          phase: {
            id: "phase",
            name: "Posa",
            start_date: "2026-10-14",
            end_date: "2026-10-20",
          },
        },
      ],
      squadre_commesse: [
        {
          squadra: team,
          phase_id: "phase",
          dal: "2026-10-15",
          al: "2026-10-15",
        },
      ],
    });
    expect(normalized.resource_bookings).toHaveLength(1);
    expect(normalized.resource_bookings![0]).toMatchObject({
      start_date: "2026-10-15",
      end_date: "2026-10-15",
      phase_id: "phase",
    });
  });
  it("sette giorni include oggi e i sei giorni seguenti; squadre segue la settimana", () => {
    expect(calendarPeriod(new Date(2026, 9, 14), "agenda")).toEqual({
      from: "2026-10-14",
      to: "2026-10-20",
    });
    expect(calendarPeriod(new Date(2026, 9, 14), "teams")).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
    });
  });
});
const conflict = (date: string, second = "B"): ConflictEntry => ({
  date,
  resourceId: "team",
  resourceName: "Squadra A",
  resourceType: "team",
  severity: "conflict",
  reason: "Sovrapposizione",
  events: [
    { type: "order", id: "A", label: "Posa A" },
    { type: "order", id: second, label: `Posa ${second}` },
  ],
});
describe("Avvisi raggruppati senza nascondere cambiamenti", () => {
  it("raggruppa gli stessi eventi su giorni consecutivi", () => {
    const groups = groupCalendarConflicts([
      conflict("2026-10-15"),
      conflict("2026-10-14"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      date: "2026-10-14",
      to: "2026-10-15",
      days: 2,
    });
  });
  it("se cambiano eventi o c'è un giorno libero, mantiene verifiche distinte", () => {
    expect(
      groupCalendarConflicts([
        conflict("2026-10-14"),
        conflict("2026-10-16"),
        conflict("2026-10-17", "C"),
      ]),
    ).toHaveLength(3);
  });
});
