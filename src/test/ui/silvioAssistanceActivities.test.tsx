import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, afterEach } from "vitest";
import { SilvioAssistanceActivitiesView } from "@/components/silvio/SilvioAssistanceActivities";
import type { FishAssistanceActivity } from "@/lib/fishAssistanceActivities";
const pending: FishAssistanceActivity = {
  id: "case-a",
  company_id: "a",
  agent_id: "agent-a",
  session_id: "phone-a",
  task_id: "task-a",
  calendar_id: "calendar-a",
  customer_id: "customer-a",
  customer_updated_at: "2026-11-17T10:00:00Z",
  identity_verified_at: "2026-11-17T10:00:00Z",
  ticket_id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ticket_action: "created",
  appointment_id: null,
  stage: "needs_office",
  reason: "booking",
  created_at: "2026-11-17T10:00:00Z",
  updated_at: "2026-11-17T10:00:00Z",
  customerName: "Cliente Esempio",
  problem: "La finestra non si chiude",
  appointment: null,
};
const booked: FishAssistanceActivity = {
  ...pending,
  id: "case-b",
  customerName: "Secondo Cliente",
  stage: "scheduled",
  reason: null,
  appointment_id: "appointment-b",
  appointment: { date: "2026-11-25", time: "10:00:00", status: "confermato" },
};
function mount(rows: FishAssistanceActivity[], error = false) {
  render(
    <MemoryRouter>
      <SilvioAssistanceActivitiesView
        activities={rows}
        error={error}
        onRefresh={() => {}}
      />
    </MemoryRouter>,
  );
}
afterEach(cleanup);
describe("Silvio support activity center", () => {
  it("shows actual progress and links to the existing customer/ticket, and filters follow-up", () => {
    mount([pending, booked]);
    expect(screen.getByText("25 novembre 2026 alle 10:00")).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Ticket e conversazione" })[0],
    ).toHaveAttribute("href", `/azienda/assistenza/${pending.ticket_id}`);
    expect(
      screen.getAllByRole("link", { name: "Scheda cliente" })[0],
    ).toHaveAttribute("href", "/azienda/clienti/customer-a");
    fireEvent.click(screen.getByRole("button", { name: "Da seguire (1)" }));
    expect(screen.getByText("Cliente Esempio")).toBeVisible();
    expect(screen.queryByText("Secondo Cliente")).not.toBeInTheDocument();
  });
  it("uses current appointment cancellation instead of presenting a stale successful booking", () => {
    mount([
      {
        ...booked,
        appointment: { ...booked.appointment!, status: "annullato" },
      },
    ]);
    expect(screen.getByText("Appuntamento da verificare")).toBeVisible();
    expect(screen.queryByText("Appuntamento fissato")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Da seguire (1)" }),
    ).toBeVisible();
  });
  it("keeps a deleted booked appointment in follow-up instead of claiming it is still booked", () => {
    mount([{...booked,appointment_id:null,appointment:null}]);
    expect(screen.getByText("Appuntamento da verificare")).toBeVisible();
    expect(screen.getByRole("button",{name:"Da seguire (1)"})).toBeVisible();
  });
  it("does not present a failed data request as an empty successful history", () => {
    mount([], true);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Non riesco a caricare",
    );
    expect(
      screen.queryByText("Le richieste di assistenza arriveranno qui"),
    ).not.toBeInTheDocument();
  });
});
