import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoTimbratura from "@/pages/campo/CampoTimbratura";
import { summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";

const state = vi.hoisted(() => ({
  insert: vi.fn(), error: vi.fn(), invalidate: vi.fn(),
  selected: "B" as string | null, punches: [] as CampoPunch[],
  timeError: false, loading: false, refetch: vi.fn(),
  assignmentsError: false, assignmentsLoading: false, assignedIds: ["A", "B"],
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(state.selected ? { order_id: state.selected } : {})] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company" } }) }));
vi.mock("@/hooks/useGPS", () => ({ useGPS: () => ({ status: "denied", requestPosition: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error } }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({
  data: state.assignedIds.map(id => ({ order_id: id, order: { id, order_code: id, description: `Cantiere ${id}` } })),
  isSuccess: !state.assignmentsError && !state.assignmentsLoading, isError: state.assignmentsError, isLoading: state.assignmentsLoading, refetch: state.refetch,
}) }));
vi.mock("@/hooks/campo/useCampoDayTime", () => ({ useCampoDayTime: () => ({
  summary: summarizeCampoTime(state.punches, { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true }),
  todayPunches: state.punches, now: new Date("2026-09-24T18:00:00Z"),
  isSuccess: !state.timeError && !state.loading, isError: state.timeError, isLoading: state.loading, refetch: state.refetch,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "campo-timbratura-order" && state.selected
    ? { id: state.selected, order_code: state.selected, description: "Cantiere selezionato" } : [] as never[], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
  useMutation: (config: { mutationFn: (tipo: string) => Promise<void>; onSuccess: (_: void, tipo: string) => void; onError: (e: unknown) => void }) => ({
    isPending: false,
    mutate: async (tipo: string) => { try { await config.mutationFn(tipo); config.onSuccess(undefined, tipo); } catch (e) { config.onError(e); } },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ insert: async (payload: unknown) => { state.insert(payload); return { error: null as null }; } }),
} }));
const punch = (tipo: string, at: string, order_id: string | null = "A"): CampoPunch => ({ id: tipo + at, tipo, timestamp_evento: `2026-09-24T${at}:00Z`, order_id });
beforeEach(() => { vi.clearAllMocks(); state.selected = "B"; state.punches = []; state.timeError = false; state.loading = false; state.assignmentsError = false; state.assignmentsLoading = false; state.assignedIds = ["A", "B"]; });
afterEach(cleanup);

describe("Timbratura: sito della sessione e schermata selezionata", () => {
  it("una nuova entrata usa il cantiere aperto", async () => {
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", { name: "TIMBRA ENTRATA" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo: "entrata", order_id: "B", user_id: "worker", company_id: "company", gps_lat: null as null })));
    expect(state.error).not.toHaveBeenCalled();
  });
  it.each([
    ["INIZIA PAUSA", "pausa_inizio", false],
    ["FINE PAUSA", "pausa_fine", true],
    ["TIMBRA USCITA", "uscita", false],
    ["TIMBRA USCITA", "uscita", true],
  ] as const)("%s mantiene A anche se è aperto B (pausa=%s)", async (label, tipo, paused) => {
    state.punches = [punch("entrata", "08:00"), ...(paused ? [punch("pausa_inizio", "12:00", null)] : [])];
    render(<CampoTimbratura />);
    expect(screen.getByText(/Hai una sessione aperta/)).toBeInTheDocument();
    expect(screen.getByText("Cantiere aperto nella schermata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo, order_id: "A" })));
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it("non trasforma una sessione generica in ore sul sito aperto", async () => {
    state.punches = [punch("entrata", "08:00", null)];
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", { name: "TIMBRA USCITA" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo: "uscita", order_id: null as null })));
  });
  it("avvisa esplicitamente quando la nuova entrata è senza cantiere", async () => {
    state.selected = null; render(<CampoTimbratura />);
    expect(screen.getByRole("button", { name: "TIMBRA ENTRATA" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Dove inizi a lavorare?"), { target: { value: "__unassigned__" } });
    expect(screen.getByText(/questa entrata registrerà ore da attribuire/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TIMBRA ENTRATA" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: null as null })));
  });
  it("dal menu sceglie un cantiere senza passare dal dettaglio", async () => {
    state.selected = null; render(<CampoTimbratura />);
    fireEvent.change(screen.getByLabelText("Dove inizi a lavorare?"), { target: { value: "A" } });
    expect(screen.getByText("Timbratura collegata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TIMBRA ENTRATA" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "A" })));
  });
  it("può cambiare destinazione prima dell'entrata senza ereditare il vecchio titolo", async () => {
    render(<CampoTimbratura />);
    fireEvent.change(screen.getByLabelText("Dove inizi a lavorare?"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "TIMBRA ENTRATA" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "A", note: "Cantiere: A" })));
  });
  it.each(["loading", "error", "unassigned"])("non registra l'entrata se l'assegnazione non è verificata: %s", cause => {
    state.assignmentsLoading = cause === "loading"; state.assignmentsError = cause === "error";
    if (cause === "unassigned") state.assignedIds = ["A"];
    render(<CampoTimbratura />);
    expect(screen.getByRole("button", { name: "TIMBRA ENTRATA" })).toBeDisabled();
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("il menu mantiene il cantiere della sessione aperta e non consente riassegnazioni", async () => {
    state.selected = null; state.punches = [punch("entrata", "08:00")]; state.assignmentsError = true;
    render(<CampoTimbratura />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hai una sessione aperta/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TIMBRA USCITA" }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "A", tipo: "uscita" })));
  });
  it("distingue ore totali e ore del cantiere, escludendo le pause", () => {
    state.punches = [punch("entrata", "08:00"), punch("uscita", "12:00"), punch("entrata", "13:00", "B"), punch("pausa_inizio", "15:00", null), punch("pausa_fine", "15:30", null), punch("uscita", "17:00", "B")];
    render(<CampoTimbratura />);
    expect(screen.getByText("7.5")).toBeInTheDocument();
    expect(screen.getByText("Su questo cantiere: 3.5 h · pause escluse")).toBeInTheDocument();
  });
  it("blocca le azioni se non conosce lo stato effettivo", () => {
    state.timeError = true; render(<CampoTimbratura />);
    expect(screen.getByRole("alert")).toHaveTextContent("Non riesco a leggere le timbrature");
    const button = screen.getByRole("button", { name: "TIMBRA ENTRATA" });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(state.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });
  it("non mostra zero ore come dato confermato durante il caricamento", () => {
    state.loading = true; render(<CampoTimbratura />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "TIMBRA ENTRATA" })).toBeDisabled();
  });
  it("invalida il modello comune e il registro HR dopo il salvataggio", async () => {
    render(<CampoTimbratura />); fireEvent.click(screen.getByRole("button", { name: "TIMBRA ENTRATA" }));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-time-day"] }));
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-rapportini-da-compilare"] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["hr-timbrature"] });
  });
});
