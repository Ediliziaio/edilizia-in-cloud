import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderLaborEconomics } from "@/components/orders/OrderLaborEconomics";

const mocks = vi.hoisted(() => ({ read: vi.fn(), retryEmployees: vi.fn(), retryTeams: vi.fn() }));
vi.mock("@/hooks/useOrderLaborEconomics", () => ({ useOrderLaborEconomics: mocks.read }));
const employee = { id: "e1", user_id: "u1", first_name: "Mario", last_name: "Rossi", costo_orario: 30 };
const ledger = { id: "r1", employee_id: "e1", employee, hours_worked: 4, total_cost: 100, cost_preventivo: 120, hourly_rate: 25 };
const query = (data: unknown[], refetch: unknown) => ({ data, refetch, isPending: false, isFetching: false, isError: false });
const state = () => ({ allowed: true, readRates: true, employees: query([ledger], mocks.retryEmployees), teams: query([], mocks.retryTeams) });
const view = () => render(<MemoryRouter><OrderLaborEconomics orderId="order" /></MemoryRouter>);
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockReturnValue(state()); });
describe("Manodopera e subappalti in Economia e pagamenti", () => {
  it("separa dipendenti dalle ditte e tariffa attuale dalla media storica", () => {
    view(); expect(screen.getByText("Dipendenti e operai interni")).toBeInTheDocument(); expect(screen.getByText("Ditte esterne e subappalti")).toBeInTheDocument();
    const person = within(screen.getByRole("region", { name: "Costi di Mario Rossi" }));
    expect(person.getByText("25,00 € / h", { exact: false })).toBeInTheDocument(); expect(person.getByText("30,00 € / h", { exact: false })).toBeInTheDocument();
    expect(person.getByText("100,00 €", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
  it("tariffa riservata resta nascosta anche se presente in cache", () => {
    mocks.read.mockReturnValue({ ...state(), readRates: false }); view();
    expect(screen.getByText("Riservata")).toBeInTheDocument(); expect(screen.queryByText("30,00 € / h", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestisci tariffe in Personale e HR" })).not.toBeInTheDocument();
  });
  it("nessun costo visibile senza permesso, anche con cache popolata", () => {
    mocks.read.mockReturnValue({ ...state(), allowed: false }); view();
    expect(screen.getByText(/non permette/)).toBeInTheDocument(); expect(screen.queryByText("Mario Rossi")).not.toBeInTheDocument();
  });
  it("errore su una fonte non mostra un totale parziale falso", () => {
    const s = state(); s.teams.isError = true; mocks.read.mockReturnValue(s); view();
    expect(screen.getByRole("alert")).toHaveTextContent("Nessun totale parziale"); expect(screen.queryByText("Mario Rossi")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(mocks.retryEmployees).toHaveBeenCalledOnce(); expect(mocks.retryTeams).toHaveBeenCalledOnce();
  });
  it("il caricamento non lampeggia a costo zero", () => {
    const s = state(); s.employees.isPending = true; mocks.read.mockReturnValue(s); view();
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento"); expect(screen.queryByText("Costo registrato")).not.toBeInTheDocument();
  });
  it("ore a costo zero hanno avviso e non vengono riprezzate", () => {
    const s = state(); s.employees.data = [{ ...ledger, total_cost: 0 }]; mocks.read.mockReturnValue(s); view();
    expect(screen.getByRole("alert")).toHaveTextContent("non valorizza retroattivamente");
  });
  it("budget mancante non mostra scostamento o oltre budget", () => {
    const s = state(); s.employees.data = [{ ...ledger, cost_preventivo: null }]; mocks.read.mockReturnValue(s); view();
    expect(screen.getByText("Da completare")).toBeInTheDocument(); expect(screen.queryByText("Oltre budget")).not.toBeInTheDocument();
  });
  it("subappalto mostra netto e lordo distinti, senza tariffa dipendente", () => {
    const s = state(); s.teams.data = [{ id: "t1", team: { name: "Edil Alfa", kind: "esterna" }, total_cost: 122, vat_rate: 22, cost_preventivo: 244 }]; mocks.read.mockReturnValue(s); view();
    const team = within(screen.getByRole("region", { name: "Costi ditta Edil Alfa" }));
    expect(team.getByText("Costo netto IVA")).toBeInTheDocument(); expect(team.getByText("122,00 €", { exact: false })).toBeInTheDocument();
    expect(team.queryByText("Tariffa attuale / h")).not.toBeInTheDocument();
  });
  it("link al diario apre la vista giusta anche da un URL con altra vista", () => {
    view(); expect(screen.getByRole("link", { name: "Verifica rapportini" })).toHaveAttribute("href", "/azienda/ordini/order?tab=cantiere&vista_cantiere=diario#section-rapportini");
  });
  it("refresh non è un salvataggio o pagamento", () => {
    view(); fireEvent.click(screen.getByRole("button", { name: "Aggiorna costi" }));
    expect(mocks.retryEmployees).toHaveBeenCalledOnce(); expect(mocks.retryTeams).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Salva|Paga|Approva/ })).not.toBeInTheDocument();
  });
});
