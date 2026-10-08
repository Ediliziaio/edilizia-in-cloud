import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendariStandardTab } from "@/components/settings/calendari-lavori/CalendariStandardTab";
import { GoogleCalendarPicker } from "@/components/settings/calendari-lavori/GoogleCalendarPicker";

const state = vi.hoisted(() => ({ error: false, accountsError: false, pending: false, mutate: vi.fn(), retry: vi.fn() }));
vi.mock("@/hooks/useCalendariLavori", () => ({
  useCalendarLinks: () => ({ data: [{ kind: "posa", google_connection_id: "a1", google_calendar_id: "g1", enabled: true }], isLoading: false, isError: state.error, refetch: state.retry }),
  useSalvaCalendarLink: () => ({ mutate: state.mutate, isPending: state.pending }),
  useConnessioniGoogleAzienda: () => ({ data: [{ id: "a1", status: "connected", google_account_email: "demo@example.it" }, { id: "a2", status: "connected", google_account_email: "secondo@example.it" }], isLoading: false, isError: state.accountsError, refetch: state.retry }),
  useCalendariDiConnessione: () => ({ data: [{ id: "g2", summary: "Nuovo calendario" }], isLoading: false, refetch: state.retry }),
}));
beforeEach(() => { vi.clearAllMocks(); state.error = false; state.accountsError = false; state.pending = false; });
afterEach(cleanup);
describe("Calendari: errori e salvataggio", () => {
  it("lo stato del calendario non annida blocchi HTML in un paragrafo", () => {
    render(<CalendariStandardTab canManage />);
    expect(screen.getByText("Attivo").closest("p")).toBeNull();
  });
  it("un errore collegamenti non viene presentato come calendario assente", () => {
    state.error = true; render(<CalendariStandardTab canManage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile leggere");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(state.retry).toHaveBeenCalled();
  });
  it("durante salvataggio congela calendario e switch", () => {
    state.pending = true; render(<CalendariStandardTab canManage />);
    expect(screen.getByRole("switch")).toBeDisabled();
    for (const control of screen.getAllByRole("combobox")) expect(control).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Salvataggio");
  });
  it("in sola lettura non consente modifiche", () => {
    render(<CalendariStandardTab canManage={false} />);
    expect(screen.getByRole("switch")).toBeDisabled(); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("errore account non suggerisce di collegare un account nuovo", () => {
    state.accountsError = true;
    render(<GoogleCalendarPicker value={{ google_connection_id: null, google_calendar_id: null }} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Account Google non disponibili");
    expect(screen.queryByText(/Nessun account Google collegato/)).not.toBeInTheDocument();
  });
  it("scegliere un account diverso non scollega quello salvato", () => {
    const change = vi.fn();
    render(<GoogleCalendarPicker value={{ google_connection_id: "a1", google_calendar_id: "g1" }} onChange={change} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Account Google" }));
    fireEvent.click(screen.getByRole("option", { name: "secondo@example.it" }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "Calendario Google" }));
    fireEvent.click(screen.getByRole("option", { name: "Nuovo calendario" }));
    expect(change).toHaveBeenCalledWith({ google_connection_id: "a2", google_calendar_id: "g2" });
  });
});
