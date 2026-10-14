import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { calendarFinanceModel } from "@/lib/calendar/financeDetails";
const state = vi.hoisted(() => ({
  allowed: true,
  pending: false,
  error: false,
  finance: undefined as unknown,
  presence: [] as unknown[],
  unassignedCount: 0,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/useCalendarOrderDetails", () => ({
  useCalendarOrderFinance: () => ({
    allowed: state.allowed,
    isPending: state.pending,
    isError: state.error,
    data: state.finance,
    refetch: state.refetch,
  }),
  useCalendarOrderPresence: () => ({
    allowed: state.allowed,
    isPending: state.pending,
    isError: state.error,
    data: { people: state.presence, unassignedCount: state.unassignedCount },
    refetch: state.refetch,
    team: true,
  }),
}));
import {
  CalendarEventPayments,
  CalendarEventPresence,
} from "@/components/calendar/CalendarEventPanels";
function payment() {
  render(
    <MemoryRouter>
      <CalendarEventPayments orderId="order-55" onNavigate={vi.fn()} />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.allowed = true;
  state.error = false;
  state.pending = false;
  state.presence = [];
  state.unassignedCount = 0;
  state.finance = calendarFinanceModel({
    order: {
      total_amount: 1000,
      vat_rate: 22,
      payment_type: null,
      financing_cost: 0,
    },
    variations: [],
    maturity: "emesso",
    rates: [
      {
        id: "rate",
        position: 0,
        label: "SAL intermedio",
        type: "balance",
        amount: 1220,
        is_paid: false,
        paid_date: null,
        data_attesa: null,
        stato_incasso: "prevista",
        trigger_evento: "sal_numero",
        trigger_numero: 1,
      },
    ],
    sals: [
      {
        id: "sal",
        numero_sal: 1,
        stato: "firmato",
        data_emissione: "2026-09-29",
        installment_id: "rate",
        importo_totale: 1000,
      },
    ],
  });
});
afterEach(cleanup);
describe("Dettaglio finanziario e presenze nel popup", () => {
  it("mostra il SAL firmato e la rata ancora da incassare, senza trasformare il verbale in un incasso", () => {
    payment();
    expect(screen.getByText("Firmato dal cliente")).toBeTruthy();
    expect(screen.getByText("0,00 €")).toBeTruthy();
    expect(screen.getByText(/SAL intermedio: Da incassare/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Apri SAL e piano pagamenti" })
        .getAttribute("href"),
    ).toBe("/azienda/ordini/order-55?tab=finanza#section-sal");
  });
  it("un errore non viene presentato come nessun incasso o nessun SAL", () => {
    state.error = true;
    payment();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Riprova incassi" }),
    ).toBeTruthy();
  });
  it("senza autorizzazione non mostra dati finanziari anche se presenti in cache", () => {
    state.allowed = false;
    payment();
    expect(
      screen.queryByRole("link", { name: "Apri SAL e piano pagamenti" }),
    ).toBeNull();
    expect(screen.queryByText("0,00 €")).toBeNull();
  });
  it("le presenze distinguono pause e lavoro e rimandano ai rapportini della stessa commessa", () => {
    state.presence = [
      {
        id: "worker",
        name: "Mario Rossi",
        minutes: 120,
        open: false,
        incomplete: false,
        state: "out",
        issues: 0,
        provisional: false,
        segments: [
          {
            start: Date.parse("2026-09-29T07:00:00Z"),
            end: Date.parse("2026-09-29T09:00:00Z"),
            kind: "work",
            provisional: false,
          },
          {
            start: Date.parse("2026-09-29T09:00:00Z"),
            end: Date.parse("2026-09-29T09:30:00Z"),
            kind: "pause",
            provisional: false,
          },
        ],
      },
    ];
    render(
      <MemoryRouter>
        <CalendarEventPresence
          orderId="order-55"
          day="2026-09-29"
          scope="team"
          onNavigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("09:00–11:00 · Lavoro")).toBeTruthy();
    expect(screen.getByText("11:00–11:30 · Pausa")).toBeTruthy();
    expect(screen.getByText(/2 h da timbrature/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Apri diario e rapportini" })
        .getAttribute("href"),
    ).toBe("/azienda/ordini/order-55?tab=cantiere#section-rapportini");
  });
  it("segnala timbrature senza persona senza ricostruire ore o dichiarare la giornata priva di registrazioni", () => {
    state.unassignedCount = 8;
    render(
      <MemoryRouter>
        <CalendarEventPresence
          orderId="order-55"
          day="2026-09-25"
          scope="team"
          onNavigate={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toContain(
      "8 timbrature senza persona associata",
    );
    expect(screen.queryByText(/Nessuna timbratura visibile/)).toBeNull();
    expect(screen.queryByText(/h da timbrature/)).toBeNull();
  });
});
