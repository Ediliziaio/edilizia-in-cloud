import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  planningGanttRows,
  planningWorkloadOnDay,
  canMoveCalendarWorkPeriod,
} from "@/lib/calendar/planningTools";
import { getOrderWorkPeriods } from "@/lib/calendar/planning";
import { normalizeCalendarView } from "@/lib/calendar/viewModes";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import type { CalendarOrder } from "@/types/calendar";

const order: CalendarOrder = {
  id: "order",
  order_code: "ORD-1",
  description: "Casa",
  expected_date: null,
  work_start_date: "2026-09-01",
  work_end_date: "2026-09-30",
  warehouse_arrival_date: null,
  created_at: "",
  customer_id: "client",
  current_status_id: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  status: null,
  work_phases: [
    {
      id: "phase-a",
      name: "Demolizione",
      position: 0,
      start_date: "2026-10-05",
      end_date: "2026-10-06",
      status: "completata",
      percentuale: 100,
    },
    {
      id: "phase-b",
      name: "Posa",
      position: 1,
      start_date: "2026-10-12",
      end_date: "2026-10-14",
      status: "in_corso",
      percentuale: 35,
    },
    {
      id: "phase-c",
      name: "Collaudo",
      position: 2,
      start_date: "2026-10-14",
      end_date: "2026-10-15",
      status: "da_iniziare",
      percentuale: 0,
    },
  ],
  resource_bookings: [
    {
      resourceId: "team",
      resourceName: "Squadra A",
      resourceType: "team",
      phase_id: "phase-b",
      start_date: "2026-10-12",
      end_date: "2026-10-14",
    },
  ],
};
describe("Strumenti allineati alla pianificazione della commessa", () => {
  it("il Gantt mostra le fasi fuori dalle date generali e non un'unica barra vecchia", () => {
    const rows = planningGanttRows([order], "2026-10-01", "2026-10-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].bars.map((b) => b.period.start_date)).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-14",
    ]);
    expect(rows[0].bars.map((b) => b.period.progress)).toEqual([100, 35, 0]);
    expect(rows[0].resources).toEqual(["Squadra A"]);
  });
  it("due fasi sovrapposte si vedono su righe distinte", () => {
    const row = planningGanttRows([order], "2026-10-01", "2026-10-31")[0];
    expect(row.bars[1].lane).not.toBe(row.bars[2].lane);
    expect(row.lanes).toBe(2);
  });
  it("il carico non occupa il vuoto fra le fasi e non raddoppia un cantiere con più fasi", () => {
    expect(planningWorkloadOnDay([order], "2026-10-09")).toEqual([]);
    const day = planningWorkloadOnDay([order], "2026-10-14");
    expect(day).toHaveLength(1);
    expect(day[0].periods).toHaveLength(2);
  });
  it("una posa e le lavorazioni dello stesso giorno contano una sola commessa", () => {
    const day = planningWorkloadOnDay(
      [{ ...order, expected_date: "2026-10-14" }],
      "2026-10-14",
    );
    expect(day).toHaveLength(1);
    expect(day[0].installation).toBe(true);
  });
  it("i filtri delle squadre limitano barre e carico ai giorni effettivamente assegnati", () => {
    const filtered: CalendarOrder = {
      ...order,
      planning_resource_filter: { employeeIds: [], teamIds: ["team"] },
    };
    expect(
      planningGanttRows([filtered], "2026-10-01", "2026-10-31")[0].bars,
    ).toHaveLength(1);
    expect(planningWorkloadOnDay([filtered], "2026-10-05")).toEqual([]);
    expect(planningWorkloadOnDay([filtered], "2026-10-13")).toHaveLength(1);
    const posaOutsideBooking = { ...filtered, expected_date: "2026-10-20" };
    expect(planningWorkloadOnDay([posaOutsideBooking], "2026-10-20")).toEqual(
      [],
    );
    expect(
      planningGanttRows([posaOutsideBooking], "2026-10-01", "2026-10-31")[0]
        .installation,
    ).toBeNull();
  });
  it("non si può spostare una fase cambiando soltanto le date generali", () => {
    expect(
      canMoveCalendarWorkPeriod(order, getOrderWorkPeriods(order)[0]),
    ).toBe(false);
    const legacy: CalendarOrder = { ...order, work_phases: undefined };
    expect(
      canMoveCalendarWorkPeriod(legacy, getOrderWorkPeriods(legacy)[0]),
    ).toBe(true);
    expect(
      canMoveCalendarWorkPeriod(
        {
          ...legacy,
          planning_resource_filter: { employeeIds: [], teamIds: [] },
        },
        getOrderWorkPeriods(legacy)[0],
      ),
    ).toBe(false);
  });
  it("le modifiche nelle commesse aggiornano calendario e agenda della stessa azienda", () => {
    const qc = new QueryClient();
    const calendar = [
      "calendar-orders",
      "list",
      "company",
      "planning-v3",
      "user",
      "team",
    ];
    const agenda = [
      "calendar-orders",
      "dashboard-personal-agenda",
      "company",
      "user",
    ];
    const other = [
      "calendar-orders",
      "list",
      "other-company",
      "planning-v3",
      "user",
      "team",
    ];
    for (const key of [calendar, agenda, other]) qc.setQueryData(key, []);
    refreshWorkQueries(qc, "order", "company");
    expect(qc.getQueryState(calendar)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(agenda)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(other)?.isInvalidated).toBe(false);
    qc.clear();
  });
  it("i collegamenti alle viste rispettano permessi e dispositivo", () => {
    expect(normalizeCalendarView("teams", false, false)).toBe("month");
    expect(normalizeCalendarView("teams", false, true)).toBe("teams");
    expect(normalizeCalendarView("gantt", true, true)).toBe("month");
    expect(normalizeCalendarView("agenda", true, false)).toBe("agenda");
    expect(normalizeCalendarView("heatmap", false, false)).toBe("heatmap");
  });
});
