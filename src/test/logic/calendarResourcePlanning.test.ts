import { describe, expect, it } from "vitest";
import {
  planningResourceRows,
  resourceCellCount,
  workloadBands,
} from "@/lib/calendar/resourcePlanning";
import type { CalendarOrder } from "@/types/calendar";
const days = [new Date(2026, 9, 14), new Date(2026, 9, 15)];
const order = {
  id: "order",
  order_code: "ORD-1",
  customer: { first_name: "Anna", last_name: "Rossi" },
  expected_date: null,
  work_start_date: "2026-10-01",
  work_end_date: "2026-10-31",
  work_phases: [
    {
      id: "phase",
      name: "Impianti",
      position: 0,
      status: "in_corso",
      start_date: "2026-10-14",
      end_date: "2026-10-15",
    },
  ],
  resource_bookings: [
    {
      resourceId: "person",
      resourceName: "Mario",
      resourceType: "employee",
      phase_id: "phase",
      start_date: "2026-10-14",
      end_date: "2026-10-14",
      start_time: "08:00",
      end_time: "12:00",
    },
    {
      resourceId: "team",
      resourceName: "Squadra A",
      resourceType: "team",
      phase_id: "phase",
      start_date: "2026-10-15",
      end_date: "2026-10-15",
    },
  ],
} as CalendarOrder;
describe("Squadre e Carico condividono assegnazioni e posa", () => {
  it("il popup conserva gli stessi colori delle lavorazioni del calendario", () => {
    const rows = planningResourceRows(
      [order],
      days,
      "employee",
      [],
      () => "#123456",
    );
    expect(rows[0].cells.get("2026-10-14")![0].color).toBe("#123456");
  });
  it("distingue i giorni anche quando tutto il mese è molto occupato", () => {
    expect(workloadBands(17, 11).map((b) => b.label)).toEqual([
      "0",
      "1–12",
      "13–14",
      "15–16",
      "17",
    ]);
  });
  it("ogni persona e squadra occupa soltanto la data della prenotazione", () => {
    const people = planningResourceRows([order], days, "employee");
    expect(people[0].days).toBe(1);
    expect(people[0].cells.has("2026-10-15")).toBe(false);
    expect(people[0].cells.get("2026-10-14")![0].work).toMatchObject({
      name: "Impianti",
      start_time: "08:00",
      end_time: "12:00",
    });
    const teams = planningResourceRows([order], days, "team");
    expect(teams[0].cells.has("2026-10-14")).toBe(false);
    expect(teams[0].cells.get("2026-10-15")![0].work?.phase_id).toBe("phase");
  });
  it("il catalogo include anche risorse senza assegnazioni, senza attribuire disponibilità", () => {
    const rows = planningResourceRows([order], days, "employee", [
      { id: "empty", name: "Giulia" },
    ]);
    expect(rows.find((r) => r.id === "empty")).toMatchObject({
      days: 0,
      orders: 0,
    });
    expect(rows.find((r) => r.id === "empty")!.cells.size).toBe(0);
  });
  it("le squadre assegnate alla sola posa non scompaiono dalla settimana", () => {
    const install: CalendarOrder = {
      ...order,
      work_start_date: null,
      work_end_date: null,
      work_phases: [],
      expected_date: "2026-10-14",
      resource_bookings: [
        {
          resourceId: "team",
          resourceName: "Squadra A",
          resourceType: "team" as const,
          start_date: "2026-10-14",
          end_date: "2026-10-14",
        },
      ],
    };
    const rows = planningResourceRows([install], days, "team");
    expect(rows[0].cells.get("2026-10-14")![0].type).toBe("posa");
    expect(rows[0].days).toBe(1);
    expect(rows[0].orders).toBe(1);
  });
  it("più fasi e prenotazioni duplicate della stessa commessa contano una volta", () => {
    const multiple = {
      ...order,
      work_phases: [
        ...order.work_phases!,
        { ...order.work_phases![0], id: "second", name: "Finiture" },
      ],
      resource_bookings: [
        order.resource_bookings![0],
        order.resource_bookings![0],
        { ...order.resource_bookings![0], phase_id: "second" },
      ],
    };
    const row = planningResourceRows([multiple], days, "employee")[0];
    expect(row.cells.get("2026-10-14")).toHaveLength(2);
    expect(resourceCellCount(row.cells.get("2026-10-14"))).toBe(1);
    expect(row.orders).toBe(1);
  });
  it("una prenotazione fuori dalle date della fase non genera occupazioni", () => {
    const shifted = {
      ...order,
      resource_bookings: [
        {
          ...order.resource_bookings![0],
          start_date: "2026-10-16",
          end_date: "2026-10-17",
        },
      ],
    };
    expect(planningResourceRows([shifted], days, "employee")).toHaveLength(0);
  });
  it("rispetta il filtro delle risorse anche sulla posa", () => {
    const filtered: CalendarOrder = {
      ...order,
      expected_date: "2026-10-14",
      planning_resource_filter: { employeeIds: [], teamIds: ["team"] },
    };
    expect(planningResourceRows([filtered], days, "employee")).toHaveLength(0);
  });
  it("il modello riletto riflette subito spostamenti e revoche delle assegnazioni", () => {
    expect(planningResourceRows([order], days, "employee")[0].days).toBe(1);
    expect(
      planningResourceRows(
        [{ ...order, resource_bookings: [] }],
        days,
        "employee",
        [{ id: "person", name: "Mario" }],
      )[0].days,
    ).toBe(0);
  });
  it.each([0, 1, 2, 5, 17, 23])(
    "la scala copre il picco %i senza buchi o colori identici per tutto il mese",
    (peak) => {
      const bands = workloadBands(peak);
      for (let count = 0; count <= peak; count++)
        expect(
          bands.filter((b) => b.min <= count && count <= b.max),
        ).toHaveLength(1);
      expect(bands[0].level).toBe(0);
      expect(bands.at(-1)!.max).toBe(peak);
      if (peak > 4) expect(bands).toHaveLength(5);
    },
  );
});
