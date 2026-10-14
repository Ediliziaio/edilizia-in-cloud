import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoRapportinoVoce from "@/pages/campo/CampoRapportinoVoce";
import type { CampoResolvedAssignment } from "@/lib/campo/assignments";
const state = vi.hoisted(() => ({ orderId: undefined as string | undefined, params: "", assignments: [] as CampoResolvedAssignment[], loading: false, error: false, navigate: vi.fn(), refetch: vi.fn() }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ orderId: state.orderId }), useNavigate: () => state.navigate, useSearchParams: () => [new URLSearchParams(state.params)], Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div> }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({ data: state.assignments, isLoading: state.loading, isError: state.error, refetch: state.refetch }) }));
const cantiere = (id: string, status = "in_corso"): CampoResolvedAssignment => ({ id: "a-" + id, order_id: id, is_capocantiere: false, sources: [], order: { id, company_id: "c", order_code: "C-" + id, description: "Lavori " + id, status, indirizzo_lavori: null, percentuale_avanzamento: 0, work_start_date: null, work_end_date: null } });
beforeEach(() => { vi.clearAllMocks(); state.orderId = undefined; state.params = ""; state.assignments = []; state.loading = false; state.error = false; });
afterEach(cleanup);
describe("La voce è un ingresso dello stesso giornaliero", () => {
  it("con più cantieri chiede prima dove, senza generare note orfane", () => {
    state.assignments = [cantiere("1"), cantiere("2")]; render(<CampoRapportinoVoce />);
    fireEvent.click(screen.getByRole("button", { name: /C-2/ }));
    expect(state.navigate).toHaveBeenCalledWith("/campo/lavoro/2/rapportino?input=voce");
  });
  it("con un cantiere solo apre lo stesso editor", () => {
    state.assignments = [cantiere("1")]; render(<CampoRapportinoVoce />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/campo/lavoro/1/rapportino?input=voce");
  });
  it("ignora chiusi, annullati e assegnazioni duplicate", () => {
    state.assignments = [cantiere("1"), { ...cantiere("1"), id: "bis" }, cantiere("2", "chiuso"), cantiere("3", "Annullato")]; render(<CampoRapportinoVoce />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/campo/lavoro/1/rapportino?input=voce");
  });
  it("preserva cantiere e giornata specificati", () => {
    state.orderId = "9"; state.params = "data=2026-10-12"; state.loading = true; render(<CampoRapportinoVoce />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/campo/lavoro/9/rapportino?input=voce&data=2026-10-12");
  });
  it("senza cantiere non propone di inviare un rapportino scollegato", () => {
    render(<CampoRapportinoVoce />); expect(screen.getByRole("status")).toHaveTextContent("Nessun cantiere aperto assegnato"); expect(screen.queryByRole("button")).toBeNull();
  });
  it("attende le assegnazioni", () => {
    state.loading = true; render(<CampoRapportinoVoce />); expect(screen.getByRole("status")).toHaveTextContent("Carico i tuoi cantieri");
  });
  it("un errore delle assegnazioni non è una lista vuota", () => {
    state.error = true; render(<CampoRapportinoVoce />); expect(screen.getByRole("alert")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Riprova" })); expect(state.refetch).toHaveBeenCalled();
  });
});
