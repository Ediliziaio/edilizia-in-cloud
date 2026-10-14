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
import { CalendarConflictsPanel } from "@/components/calendar/CalendarConflictsPanel";
import type { CalendarOrder } from "@/types/calendar";
const order: CalendarOrder = {
  id: "order",
  order_code: "ORD-1",
  description: "Casa",
  expected_date: null,
  work_start_date: "2026-10-01",
  work_end_date: "2026-10-31",
  warehouse_arrival_date: null,
  created_at: "",
  customer_id: "c",
  current_status_id: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  status: null,
  resource_bookings: [
    {
      resourceId: "team",
      resourceType: "team",
      resourceName: "Squadra A",
      phase_name: "Posa pavimenti",
      phase_id: "phase",
      start_date: "2026-10-14",
      end_date: "2026-10-14",
    },
    {
      resourceId: "worker",
      resourceType: "employee",
      resourceName: "Mario Bianchi",
      phase_name: "Posa pavimenti",
      phase_id: "phase",
      start_date: "2026-10-14",
      end_date: "2026-10-15",
      start_time: "08:00:00",
      end_time: "12:00:00",
    },
  ],
};
afterEach(cleanup);
describe("Pianificazione risorse e avvisi utilizzabili", () => {
  it("una squadra occupa soltanto le date assegnate, con collegamento alle lavorazioni", () => {
    render(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[order]}
          currentDate={new Date(2026, 9, 14)}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getAllByRole("link", { name: /Posa pavimenti/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /Posa pavimenti/ }).getAttribute("href"),
    ).toContain("vista_cantiere=lavorazioni");
    expect(screen.getByText("Orario da definire")).toBeTruthy();
  });
  it("passare a persone usa gli orari effettivi e le date delle assegnazioni", () => {
    render(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[order]}
          currentDate={new Date(2026, 9, 14)}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Persone" }));
    expect(screen.getByText("Mario Bianchi")).toBeTruthy();
    expect(screen.getAllByText("08:00–12:00")).toHaveLength(2);
  });
  it("una selezione di risorse non espone righe di risorse escluse", () => {
    render(
      <MemoryRouter>
        <CalendarTeamWeekView
          orders={[
            {
              ...order,
              planning_resource_filter: {
                employeeIds: ["worker"],
                teamIds: [],
              },
            },
          ]}
          currentDate={new Date(2026, 9, 14)}
          onDateChange={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Squadra A")).toBeNull();
    expect(screen.getByText(/Nessuna assegnazione a squadre/)).toBeTruthy();
  });
  it("gli avvisi aprono la commessa corretta o l'appuntamento con il suo identificativo", () => {
    const onAppointment = vi.fn(),
      onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <CalendarConflictsPanel
          open
          onOpenChange={onOpenChange}
          onAppointment={onAppointment}
          groups={[
            {
              date: "2026-10-14",
              to: "2026-10-16",
              days: 3,
              resourceId: "worker",
              resourceType: "employee",
              resourceName: "Mario",
              reason: "Verifica orari",
              severity: "warning",
              events: [
                {
                  type: "order",
                  id: "order",
                  orderId: "order",
                  label: "Posa ORD-1",
                },
                {
                  type: "appointment",
                  id: "meeting",
                  label: "Sopralluogo",
                  start: "11:00",
                  end: "11:30",
                },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    const panel = within(screen.getByRole("dialog"));
    expect(panel.getByText(/3 giorni/)).toBeTruthy();
    expect(
      panel.getByRole("link", { name: "Posa ORD-1" }).getAttribute("href"),
    ).toContain("/ordini/order?");
    fireEvent.click(panel.getByRole("button", { name: /Sopralluogo/ }));
    expect(onAppointment).toHaveBeenCalledWith("meeting");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
