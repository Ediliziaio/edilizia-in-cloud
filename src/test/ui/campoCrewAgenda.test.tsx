import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CampoCrewAgenda } from "@/components/campo/CampoCrewAgenda";
import type { CampoCrewShift } from "@/lib/campo/crewAgenda";
const state = vi.hoisted(() => ({ enabled: true, rows: [] as CampoCrewShift[], error: false, pending: false, assigned: true, accessError: false, refetch: vi.fn(), accessRefetch: vi.fn(), hook: vi.fn() }));
vi.mock("@/hooks/campo/useCampoCrewAgenda", () => ({ get campoCrewAgendaEnabled() { return state.enabled; }, useCampoCrewAgenda: (day: string) => {
  state.hook(day); return { data: state.rows, isPending: state.pending, isError: state.error, refetch: state.refetch };
} }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({ data: state.assigned ? [{ order_id: "o", order: { company_id: "c" } }] : [], isSuccess: !state.accessError, isError: state.accessError, refetch: state.accessRefetch }) }));
const row: CampoCrewShift = { shiftId: "s", version: "v", companyId: "c", orderId: "o", teamName: "Squadra posa", phaseName: "Pavimenti", orderCode: "C-1", orderDescription: "Ristrutturazione", address: "Via Roma", workDate: "2026-09-24", startTime: "08:00", endTime: "12:00", isReferente: false, status: "planned" };
const show = (day = "2026-09-24") => render(<MemoryRouter><CampoCrewAgenda day={day} /></MemoryRouter>);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-24T09:00:00Z")); vi.clearAllMocks(); state.enabled = true; state.rows = [row]; state.error = false; state.pending = false; state.assigned = true; state.accessError = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("Agenda squadra Campo", () => {
  it("non monta query o interfaccia su backend remoto", () => { state.enabled = false; show(); expect(state.hook).not.toHaveBeenCalled(); expect(screen.queryByRole("region")).not.toBeInTheDocument(); });
  it("porta al cantiere giusto e alla timbratura senza registrare ore", () => {
    show(); expect(screen.getByText(/orari previsti, non ore lavorate/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri cantiere" })).toHaveAttribute("href", "/campo/lavoro/o");
    expect(screen.getByRole("link", { name: "Vai alla timbratura" })).toHaveAttribute("href", "/campo/timbratura?order_id=o");
    expect(screen.queryByText(/ore lavorate:/)).not.toBeInTheDocument();
  });
  it("mantiene separati i turni dello stesso giorno", () => { state.rows = [row, { ...row, shiftId: "s2", orderId: "b", orderCode: "C-2", startTime: "13:00", endTime: "17:00" }]; show(); expect(screen.getAllByRole("listitem")).toHaveLength(2); expect(screen.getByText("C-2")).toBeInTheDocument(); });
  it.each(["missing", "error"])("non trasforma il turno in un permesso: %s", cause => {
    state.assigned = cause !== "missing"; state.accessError = cause === "error"; show();
    expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.getByRole("status")).toHaveTextContent(cause === "error" ? "Accessi non verificati" : "Accesso operativo da attivare");
  });
  it("referente non diventa capocantiere", () => { state.rows = [{ ...row, isReferente: true }]; show(); expect(screen.getByText(/permessi da capocantiere restano separati/)).toBeInTheDocument(); });
  it("annullamento conserva l'informazione ma rimuove le azioni", () => { state.rows = [{ ...row, status: "cancelled" }]; show(); expect(screen.getByText("Annullato")).toBeInTheDocument(); expect(screen.queryByRole("link")).not.toBeInTheDocument(); });
  it("giorni futuri non propongono di timbrare oggi", () => { show("2026-09-25"); expect(screen.queryByRole("link", { name: "Vai alla timbratura" })).not.toBeInTheDocument(); });
  it("errore non mostra turni obsoleti o falso vuoto e consente di riprovare", () => {
    state.error = true; show(); expect(screen.getByRole("alert")).toBeInTheDocument(); expect(screen.queryByText("C-1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprova agenda" })); expect(state.refetch).toHaveBeenCalledOnce(); expect(state.accessRefetch).toHaveBeenCalledOnce();
  });
  it("distingue caricamento e agenda vuota", () => { state.pending = true; const view = show(); expect(screen.getByRole("status")).toHaveTextContent("Caricamento"); view.unmount(); state.pending = false; state.rows = []; show(); expect(screen.getByText(/Nessun turno di squadra/)).toBeInTheDocument(); });
  it("la Home passa al nuovo giorno italiano anche lasciando aperta la pagina", () => {
    render(<MemoryRouter><CampoCrewAgenda /></MemoryRouter>);
    expect(state.hook).toHaveBeenLastCalledWith("2026-09-24");
    act(() => { vi.setSystemTime(new Date("2026-09-24T22:30:00Z")); vi.advanceTimersByTime(30000); });
    expect(state.hook).toHaveBeenLastCalledWith("2026-09-25");
  });
});
