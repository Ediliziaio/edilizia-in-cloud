import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderDitteEconomics, OrderLaborEconomics } from "@/components/orders/OrderLaborEconomics";

vi.mock("@/components/personale/DailyHoursPanel", () => ({ DailyHoursPanel: (): null => null }));
const mocks = vi.hoisted(() => ({ read: vi.fn(), retryEmployees: vi.fn(), retryTeams: vi.fn(), cedolini: vi.fn(), admin: { isAdmin: false } }));
vi.mock("@/hooks/useCostoDaCedolini", () => ({ useCostoDaCedolini: mocks.cedolini }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.admin }));
vi.mock("@/hooks/useOrderLaborEconomics", () => ({ useOrderLaborEconomics: mocks.read }));
vi.mock("@/hooks/useParametriCostoPersonale", () => ({ useParametriCostoPersonale: () => ({ data: {} }) }));
const employee = { id: "e1", user_id: "u1", first_name: "Mario", last_name: "Rossi", costo_orario: 30 };
const ledger = { id: "r1", employee_id: "e1", employee, hours_worked: 4, total_cost: 100, cost_preventivo: 120, hourly_rate: 25 };
const query = (data: unknown[], refetch: unknown) => ({ data, refetch, isPending: false, isFetching: false, isError: false });
const state = () => ({ allowed: true, readRates: true, canCheckPending:true, pendingReports:{data:0,isPending:false,isError:false}, employees: query([ledger], mocks.retryEmployees), teams: query([], mocks.retryTeams) });
const view = () => render(<MemoryRouter><OrderLaborEconomics orderId="order" /></MemoryRouter>);
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.admin.isAdmin = false; mocks.cedolini.mockReturnValue({ data: undefined, isError: false, refetch: vi.fn() }); mocks.read.mockReturnValue(state()); });
describe("Manodopera in Fatture e costi", () => {
  it("separa dipendenti dalle ditte e tariffa attuale dalla media storica", () => {
    view(); expect(screen.getByText("Dipendenti e operai interni")).toBeInTheDocument(); expect(screen.queryByText("Ditte esterne e subappalti")).toBeNull();
    const person = within(screen.getByRole("table", { name: "Costi dei dipendenti" }));
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
    const s = state(); s.teams.data = [{ id: "t1", team: { name: "Edil Alfa", kind: "esterna" }, total_cost: 122, vat_rate: 22, cost_preventivo: 244 }]; mocks.read.mockReturnValue(s); render(<MemoryRouter><OrderDitteEconomics orderId="order" /></MemoryRouter>);
    expect(screen.getByText(/Ditte esterne e subappalti/)).toBeInTheDocument();
    const team = within(screen.getByRole("table", { name: "Costi delle ditte" }));
    expect(team.getByText("Costo netto IVA")).toBeInTheDocument(); expect(team.getByText("122,00 €", { exact: false })).toBeInTheDocument();
    expect(team.queryByText("Tariffa attuale / h")).not.toBeInTheDocument();
  });
  it("senza dati dei cedolini non mostra colonne di confronto", () => {
    view();
    expect(screen.queryByText("Costo da cedolino")).toBeNull();
    expect(mocks.cedolini).toHaveBeenCalledWith("order", ["e1"], false);
  });
  it("l'amministratore vede il costo dal cedolino e il dettaglio mese per mese; il margine non cambia", () => {
    mocks.admin.isAdmin = true;
    mocks.cedolini.mockReturnValue({ isError: false, refetch: vi.fn(), data: {
      rapportini: [{ data_lavoro: "2026-03-10", presenze_registrate: [{ employee_id: "e1", ore: 4, costo: 100 }] }],
      cedolini: [{ employee_id: "e1", anno: 2026, mese: 3, lordo: 3000, contributi_datore: 840, ore_lavorate: 160 }],
    } });
    view();
    expect(mocks.cedolini).toHaveBeenCalledWith("order", ["e1"], true);
    // (3.000 + 840) / 160 = 24 €/h × 4 h = 96 €, contro 100 € registrati.
    expect(screen.getByText("24,00 € / h", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/la stima è alta di/)).toHaveTextContent("4,00");
    expect(screen.getByText(/Il margine della commessa usa ancora il costo registrato/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mese per mese di Mario Rossi" }));
    expect(within(screen.getByRole("table", { name: "Costo mese per mese" })).getByText("03/2026")).toBeInTheDocument();
  });
  it("senza ditte non mostra un riquadro a zero", () => {
    const { container } = render(<MemoryRouter><OrderDitteEconomics orderId="order" /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
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

it("rapportini in attesa non mostrano uno scostamento completo",()=>{const s=state();s.pendingReports.data=1;mocks.read.mockReturnValue(s);view();expect(screen.getByText(/Rapportini in attesa: 1/)).toBeInTheDocument();expect(screen.getByText("Scostamento dal budget").parentElement).toHaveTextContent("—");});
