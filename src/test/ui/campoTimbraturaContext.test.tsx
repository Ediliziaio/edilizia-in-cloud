import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CampoTimbratura from "@/pages/campo/CampoTimbratura";
import { summarizeCampoTime, type CampoPunch } from "@/lib/campo/timeSummary";

const state = vi.hoisted(() => ({
  insert: vi.fn(), rpc: vi.fn(), error: vi.fn(), success: vi.fn(), invalidate: vi.fn(),
  selected: "B" as string | null, punches: [] as CampoPunch[],
  timeError: false, loading: false, refetch: vi.fn(),
  assignmentsError: false, assignmentsLoading: false, assignedIds: ["A", "B"],
  sedi: [] as { id: string; nome: string }[], oggi: [] as string[],
  rpcError: null as unknown,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams(state.selected ? { order_id: state.selected } : {})] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company" } }) }));
vi.mock("@/hooks/useGPS", () => ({ useGPS: () => ({ status: "denied", requestPosition: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/hooks/campo/useCampoAssignments", () => ({ useCampoAssignments: () => ({
  data: state.assignmentsError || state.assignmentsLoading ? undefined
    : state.assignedIds.map(id => ({ order_id: id, order: { id, order_code: id, description: `Cantiere ${id}` } })),
  isSuccess: !state.assignmentsError && !state.assignmentsLoading, isError: state.assignmentsError, isLoading: state.assignmentsLoading, refetch: state.refetch,
}) }));
vi.mock("@/hooks/campo/useCampoSedi", () => ({ useCampoSedi: () => ({ data: state.sedi, isSuccess: true, isError: false, isLoading: false }) }));
vi.mock("@/hooks/campo/useCampoGiornata", () => ({ useMiaGiornata: () => ({
  data: { giorni: [{ giorno: "2026-09-24", cantieri: state.oggi.map(id => ({ order_id: id })) }], senza_date: [] as never[] }, isLoading: false, isError: false,
}) }));
vi.mock("@/hooks/campo/useCampoDayTime", () => ({ useCampoDayTime: () => ({
  summary: summarizeCampoTime(state.punches, { start: new Date("2026-09-24T00:00:00Z"), end: new Date("2026-09-25T00:00:00Z"), now: new Date("2026-09-24T18:00:00Z"), includeOpen: true }),
  todayPunches: state.punches, now: new Date("2026-09-24T18:00:00Z"),
  isSuccess: !state.timeError && !state.loading, isError: state.timeError, isLoading: state.loading, refetch: state.refetch,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] as never[], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
  useMutation: (config: { mutationFn: (arg: unknown) => Promise<unknown>; onSuccess: (r: unknown, arg: unknown) => unknown; onError: (e: unknown) => void }) => ({
    isPending: false, variables: undefined as unknown,
    mutate: async (arg: unknown) => { try { const r = await config.mutationFn(arg); await config.onSuccess(r, arg); } catch (e) { config.onError(e); } },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ insert: async (payload: unknown) => { state.insert(payload); return { error: null as null }; } }),
  rpc: async (fn: string, args: unknown) => { state.rpc(fn, args); return { data: { ok: true }, error: state.rpcError }; },
} }));
const punch = (tipo: string, at: string, order_id: string | null = "A", extra: Partial<CampoPunch> = {}): CampoPunch =>
  ({ id: tipo + at, tipo, timestamp_evento: `2026-09-24T${at}:00Z`, order_id, ...extra });
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  state.selected = "B"; state.punches = []; state.timeError = false; state.loading = false;
  state.assignmentsError = false; state.assignmentsLoading = false; state.assignedIds = ["A", "B"];
  state.sedi = []; state.oggi = []; state.rpcError = null;
});
afterEach(cleanup);

const INIZIA = { name: "INIZIA LA GIORNATA" };
const FINE = { name: "FINE GIORNATA" };

describe("Timbratura a un tocco: inizio giornata", () => {
  it("col cantiere del link già scelto basta un tocco", async () => {
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "entrata", order_id: "B", in_sede: false, sede_id: null, user_id: "worker", company_id: "company", gps_lat: null as null,
    })));
    expect(state.error).not.toHaveBeenCalled();
    expect(state.success).toHaveBeenCalledWith("Giornata iniziata");
  });
  it("senza link e con più cantieri di oggi lascia scegliere, poi parte con un tocco", async () => {
    state.selected = null; state.oggi = ["A", "B"];
    render(<CampoTimbratura />);
    expect(screen.getByRole("button", INIZIA)).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Da dove parti?"), { target: { value: "c:A" } });
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "A", note: "Cantiere: A" })));
  });
  it("chi ha un solo cantiere di oggi parte da lì senza scegliere", async () => {
    state.selected = null; state.assignedIds = ["A"];
    render(<CampoTimbratura />);
    expect(screen.getByLabelText("Da dove parti?")).toHaveValue("c:A");
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "A" })));
  });
  it("chi parte dal magazzino lo dichiara: niente cantiere, sede e flag «in sede»", async () => {
    state.selected = null; state.assignedIds = []; state.sedi = [{ id: "S", nome: "Magazzino Verona" }];
    render(<CampoTimbratura />);
    expect(screen.getByLabelText("Da dove parti?")).toHaveValue("s:S");
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "entrata", order_id: null as null, sede_id: "S", in_sede: true, note: "Sede: Magazzino Verona",
    })));
  });
  it("ricorda da dove si è partiti l'ultima volta e lo propone al giorno dopo", async () => {
    state.selected = null; state.oggi = ["A", "B"]; state.sedi = [{ id: "S", nome: "Magazzino" }];
    const { unmount } = render(<CampoTimbratura />);
    fireEvent.change(screen.getByLabelText("Da dove parti?"), { target: { value: "s:S" } });
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalled());
    unmount();
    render(<CampoTimbratura />);
    expect(screen.getByLabelText("Da dove parti?")).toHaveValue("s:S");
  });
  it("avvisa esplicitamente quando l'entrata è senza posto", async () => {
    state.selected = null; state.oggi = ["A", "B"];
    render(<CampoTimbratura />);
    fireEvent.change(screen.getByLabelText("Da dove parti?"), { target: { value: "n" } });
    expect(screen.getByText(/Questa entrata registrerà ore da attribuire/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: null as null, in_sede: false })));
  });
  it.each(["loading", "error"])("senza elenco dei cantieri verificato non si può partire da un cantiere: %s", cause => {
    state.assignmentsLoading = cause === "loading"; state.assignmentsError = cause === "error";
    state.oggi = ["A", "B"];
    render(<CampoTimbratura />);
    expect(screen.getByRole("button", INIZIA)).toBeDisabled();
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("un cantiere del link che non è assegnato non viene mai proposto né timbrato", async () => {
    state.selected = "B"; state.assignedIds = ["A"]; state.oggi = ["A"];
    render(<CampoTimbratura />);
    const scelta = screen.getByLabelText("Da dove parti?") as HTMLSelectElement;
    expect([...scelta.options].map(o => o.value)).not.toContain("c:B");
    expect(scelta).toHaveValue("c:A");
    fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "A" })));
    expect(state.insert).not.toHaveBeenCalledWith(expect.objectContaining({ order_id: "B" }));
  });
});

describe("Timbratura a un tocco: durante la giornata", () => {
  it.each([
    ["INIZIA PAUSA", "pausa_inizio", false],
    ["FINE PAUSA", "pausa_fine", true],
    ["FINE GIORNATA", "uscita", false],
    ["FINE GIORNATA", "uscita", true],
  ] as const)("%s resta sul posto aperto (A) anche se il link porta a B (pausa=%s)", async (label, tipo, paused) => {
    state.punches = [punch("entrata", "08:00"), ...(paused ? [punch("pausa_inizio", "12:00", null)] : [])];
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo, order_id: "A", in_sede: false })));
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
  it("non trasforma una sessione senza cantiere in ore sul cantiere del link", async () => {
    state.punches = [punch("entrata", "08:00", null)];
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", FINE));
    await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ tipo: "uscita", order_id: null as null })));
  });
  it("mostra dov'è la persona e da che ora", () => {
    state.selected = null; state.punches = [punch("entrata", "08:00")];
    render(<CampoTimbratura />);
    expect(screen.getByText("In servizio")).toBeInTheDocument();
    expect(screen.getByText("A · Cantiere A", { exact: false })).toBeInTheDocument();
  });
  it("un tocco sul nuovo posto cambia luogo senza due timbrature a mano", async () => {
    state.selected = null; state.punches = [punch("entrata", "08:00")]; state.sedi = [{ id: "S", nome: "Magazzino" }];
    render(<CampoTimbratura />);
    expect(screen.getByText("Sei arrivato in un altro posto?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cantiere A/ })).not.toBeInTheDocument(); // già qui
    fireEvent.click(screen.getByRole("button", { name: /B · Cantiere B/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_timbra_cambio_luogo", expect.objectContaining({ p_order_id: "B", p_sede_id: null as null })));
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.success).toHaveBeenCalledWith(expect.stringContaining("Ora sei"));
  });
  it("tornare in sede è un tocco sulla sede", async () => {
    state.selected = null; state.punches = [punch("entrata", "08:00")]; state.sedi = [{ id: "S", nome: "Magazzino" }];
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", { name: "Magazzino" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_timbra_cambio_luogo", expect.objectContaining({ p_order_id: null as null, p_sede_id: "S" })));
  });
  it("i cantieri non di oggi stanno in un menu a parte e cambiano posto alla scelta", async () => {
    state.selected = null; state.assignedIds = ["A", "B", "C"]; state.oggi = ["A", "B"];
    state.punches = [punch("entrata", "08:00")];
    render(<CampoTimbratura />);
    expect(screen.queryByRole("button", { name: /C · Cantiere C/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Altro cantiere"), { target: { value: "c:C" } });
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_timbra_cambio_luogo", expect.objectContaining({ p_order_id: "C" })));
  });
  it("in pausa non si cambia posto: si dice di terminare prima la pausa", () => {
    state.selected = null; state.punches = [punch("entrata", "08:00"), punch("pausa_inizio", "12:00", "A")];
    render(<CampoTimbratura />);
    expect(screen.queryByText("Sei arrivato in un altro posto?")).not.toBeInTheDocument();
    expect(screen.getByText("Per cambiare posto termina prima la pausa.")).toBeInTheDocument();
  });
  it("mostra la frase del database quando il cambio non è possibile, senza testo tecnico", async () => {
    state.selected = null; state.punches = [punch("entrata", "08:00")];
    state.rpcError = { code: "P0001", message: "Sei già qui: tocca un altro posto per cambiare." };
    render(<CampoTimbratura />);
    fireEvent.click(screen.getByRole("button", { name: /B · Cantiere B/ }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Sei già qui: tocca un altro posto per cambiare."));
    state.error.mockClear(); state.rpcError = { code: "23505", message: "duplicate key value violates unique constraint" };
    fireEvent.click(screen.getByRole("button", { name: /B · Cantiere B/ }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Non sono riuscito a cambiare posto. Riprova."));
  });
});

describe("Timbratura a un tocco: ore e controlli", () => {
  it("il tempo in sede non è «da attribuire», quello senza posto sì", () => {
    state.selected = null;
    state.punches = [punch("entrata", "07:00", null, { in_sede: true, sede_id: "S" }), punch("uscita", "08:00", null, { in_sede: true, sede_id: "S" }),
      punch("entrata", "08:00", "A"), punch("uscita", "12:00", "A")];
    render(<CampoTimbratura />);
    expect(screen.queryByText(/senza cantiere né sede/)).not.toBeInTheDocument();
    cleanup();
    state.punches = [punch("entrata", "07:00", null), punch("uscita", "08:00", null)];
    render(<CampoTimbratura />);
    expect(screen.getByText(/1 h senza cantiere né sede/)).toBeInTheDocument();
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
    const button = screen.getByRole("button", INIZIA);
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(state.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalled();
  });
  it("non mostra zero ore come dato confermato durante il caricamento", () => {
    state.loading = true; render(<CampoTimbratura />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("button", INIZIA)).toBeDisabled();
  });
  it("invalida il modello comune e il registro HR dopo il salvataggio", async () => {
    render(<CampoTimbratura />); fireEvent.click(screen.getByRole("button", INIZIA));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-time-day"] }));
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-rapportini-da-compilare"] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["hr-timbrature"] });
  });
});
