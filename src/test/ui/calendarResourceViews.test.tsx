import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarTeamWeekView } from "@/components/calendar/CalendarTeamWeekView";
import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import type { CalendarOrder } from "@/types/calendar";
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditOrders: false, canViewScadenzario: false }),
}));
vi.mock("@/components/calendar/CalendarDayDetailsDialog", () => ({
  CalendarDayDetailsDialog: ({
    events,
    contextLabel,
  }: {
    events: { order: CalendarOrder }[];
    contextLabel?: string;
  }) => (
    <div role="dialog">
      {contextLabel} · {events.map((e) => e.order.order_code).join(",")}
    </div>
  ),
}));
const date = new Date(2026, 9, 14);
const order = {
  id: "a",
  order_code: "ORD-1",
  expected_date: "2026-10-14",
  work_phases: [],
  work_start_date: null,
  work_end_date: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  resource_bookings: [
    {
      resourceId: "team",
      resourceName: "Squadra A",
      resourceType: "team",
      start_date: "2026-10-14",
      end_date: "2026-10-14",
    },
  ],
} as CalendarOrder;
afterEach(cleanup);
describe("Gestione leggibile di squadre e carico", () => {
  it("la settimana comprende posa, risorse non assegnate e ricerca", () => {
    render(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[order]}
          teams={[{ id: "empty", name: "Squadra B" }]}
          currentDate={date}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Apri lavorazioni Posa/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Squadra B")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Con assegnazioni" }));
    expect(screen.getByText("Squadra B")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Cerca risorsa nella settimana" }),
      { target: { value: "Squadra B" } },
    );
    expect(screen.queryByText("Squadra A")).toBeNull();
    expect(screen.getByText("Squadra B")).toBeTruthy();
  });
  it("il popup della squadra segue i dati aggiornati e non conserva una copia della commessa", () => {
    const { rerender } = render(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[order]}
          currentDate={date}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Dettagli Posa · Rossi · ORD-1 · 2026-10-14",
      }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "Squadra A · ORD-1",
    );
    rerender(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[{ ...order, order_code: "ORD-AGGIORNATO" }]}
          currentDate={date}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog").textContent).toContain("ORD-AGGIORNATO");
  });
  it("Carico include squadre esterne e apre solo le loro assegnazioni del giorno", () => {
    render(
      <CalendarHeatmapView
        orders={[
          order,
          {
            ...order,
            id: "other",
            order_code: "ORD-ALTRO",
            resource_bookings: [],
          },
        ]}
        teams={[{ id: "empty", name: "Squadra B" }]}
        currentDate={date}
        onDateChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Per squadra" }));
    expect(
      screen.getByRole("button", { name: "Squadra A · 14 ott: 1 cantieri" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Squadra B · 14 ott: 0 cantieri" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Squadra A · 14 ott: 1 cantieri" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "Squadra A · ORD-1",
    );
    expect(screen.getByRole("dialog").textContent).not.toContain("ORD-ALTRO");
  });
  it("limita le schede visibili nelle celle affollate e permette di aprirle tutte", () => {
    render(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[
            order,
            { ...order, id: "b", order_code: "ORD-2" },
            { ...order, id: "c", order_code: "ORD-3" },
          ]}
          currentDate={date}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getAllByRole("link", { name: /Apri lavorazioni/ }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Vedi tutte (3)" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "ORD-1,ORD-2,ORD-3",
    );
  });
  it("la legenda si adatta al volume del mese senza chiamarlo disponibilità", () => {
    render(
      <CalendarHeatmapView
        orders={Array.from({ length: 17 }, (_, i) => ({
          ...order,
          id: String(i),
        }))}
        currentDate={date}
        onDateChange={vi.fn()}
      />,
    );
    const legend = within(screen.getByLabelText("Legenda del carico"));
    expect(legend.getByText("14–17 cantieri")).toBeTruthy();
    expect(screen.queryByText(/Squadra libera/)).toBeNull();
  });
});
