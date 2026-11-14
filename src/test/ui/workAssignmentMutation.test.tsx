import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderWorkPhases, type AddAssignmentPayload } from "@/hooks/useOrderWorkPhases";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc:vi.fn(), invalidate: vi.fn(), warning: vi.fn(), error: vi.fn(), employees: undefined as unknown, fasi: undefined as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc:mocks.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, error: mocks.error } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === "employees_active" ? mocks.employees : queryKey[0] === "order_work_phases" ? mocks.fasi : undefined,
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: (config: { mutationFn: (arg: unknown) => Promise<unknown>; onSuccess?: (result: unknown) => void; onError?: (error: unknown) => void }) => ({
    mutateAsync: async (arg: unknown) => {
      try { const result = await config.mutationFn(arg); config.onSuccess?.(result); return result; }
      catch (e) { config.onError?.(e); throw e; }
    },
  }),
}));
const payload: AddAssignmentPayload = { phase_id: "phase", executor_type: "interno", employee_id: "employee", external_team_id: null as null,
  cost_preventivo: 100, cost_consuntivo: 0, hours: null as null, notes: null as null, is_paid: false, paid_date: null as null };
const builder = (result: unknown, insertResult: unknown = { error: null as null }) => {
  const q = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), insert: vi.fn().mockResolvedValue(insertResult) };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.limit.mockReturnValue(q); return q;
};
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.fasi = undefined; });

describe("Chiusura di una fase dall'ufficio (06/10/2026)", () => {
  const aggiorna = () => {
    const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn() };
    q.update.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.select.mockResolvedValue({ data: [{ id: "fase" }], error: null as null });
    mocks.from.mockReturnValue(q);
    return q;
  };

  it("se il database non scrive niente lo dice col messaggio dei permessi (14/11/2026)", async () => {
    mocks.fasi = { phases: [{ id: "aperta", status: "in_corso" }], unassigned: [] as unknown[], all: [] as unknown[] };
    const q = aggiorna();
    q.select.mockResolvedValue({ data: [] as unknown[], error: null as null });
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.updatePhase.mutateAsync({ id: "aperta", importo_venduto: 1000 })).rejects.toThrow(/Non hai i permessi/);
  });

  it("chiudere una fase aperta ne registra il giorno; «richiudere» una già chiusa (rettifica a 100) non lo sposta", async () => {
    mocks.fasi = { phases: [{ id: "chiusa", status: "completata" }, { id: "aperta", status: "in_corso" }], unassigned: [] as unknown[], all: [] as unknown[] };
    const q = aggiorna();
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.updatePhase.mutateAsync({ id: "aperta", status: "completata" });
    expect(q.update.mock.calls[0][0]).toHaveProperty("completata_il");
    await result.current.updatePhase.mutateAsync({ id: "chiusa", status: "completata", percentuale: 100 });
    expect(q.update.mock.calls[1][0]).not.toHaveProperty("completata_il");
    expect(q.update.mock.calls[1][0]).toMatchObject({ status: "completata", percentuale: 100 });
  });

  it("riaprire una fase chiusa toglie il giorno di chiusura", async () => {
    mocks.fasi = { phases: [{ id: "chiusa", status: "completata" }], unassigned: [] as unknown[], all: [] as unknown[] };
    const q = aggiorna();
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.updatePhase.mutateAsync({ id: "chiusa", status: "in_corso", percentuale: 80 });
    expect(q.update.mock.calls[0][0]).toMatchObject({ completata_il: null, completata_da: null });
  });
});

describe("Collegamento assegnazione e app Campo (API simulate)", () => {
  it('assegna un’anagrafica priva di squadra con una sola RPC, non con due scritture parziali',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:'assignment',error:null});const {result}=renderHook(()=>useOrderWorkPhases('order'));
    await result.current.addAssignment.mutateAsync({...payload,executor_type:'esterno',employee_id:null,external_team_id:null,subappaltatore_id:'sub'});
    expect(mocks.rpc).toHaveBeenCalledWith('commessa_assegna_subappaltatore',{p_order_id:'order',p_subappaltatore_id:'sub',p_phase_id:'phase',p_cost_preventivo:100,p_cost_consuntivo:0,p_notes:null});
    expect(mocks.from).not.toHaveBeenCalled();expect(mocks.invalidate).toHaveBeenCalledWith({queryKey:['assignment-companies','company']});
  });
  it("l'origine del costo che il database non scrive lo dice col messaggio dei permessi (14/11/2026)", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "assignment", error: null });
    const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn().mockResolvedValue({ data: [] as unknown[], error: null as null }) };
    q.update.mockReturnValue(q); q.eq.mockReturnValue(q); mocks.from.mockReturnValue(q);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync({ ...payload, executor_type: "esterno", employee_id: null, external_team_id: null, subappaltatore_id: "sub",
      origine_costo: { costo_origine: "listino" } } as unknown as AddAssignmentPayload);
    expect(q.select).toHaveBeenCalledWith("id");
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringMatching(/Ditta assegnata/), expect.objectContaining({ description: expect.stringMatching(/permess/i) }));
  });
  it('un errore del collegamento atomico non tenta un inserimento legacy né segnala successo',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:new Error('Collegamento non riuscito')});const {result}=renderHook(()=>useOrderWorkPhases('order'));
    await expect(result.current.addAssignment.mutateAsync({...payload,executor_type:'esterno',employee_id:null,external_team_id:null,subappaltatore_id:'sub'})).rejects.toThrow('Collegamento non riuscito');
    expect(mocks.from).not.toHaveBeenCalled();expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it.each([{hours: 8}, {cost_consuntivo: 208}])("assegnare un dipendente non può inserire un consuntivo %s", async patch => {
    const {result} = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.addAssignment.mutateAsync({...payload, ...patch})).rejects.toThrow(/rapportini/);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("non imputa la squadra interna come subappaltatore neppure chiamando la mutation", async () => {
    const team = builder({ data: { id: "team", kind: "interna", is_active: true }, error: null as null });
    const assignments = builder(null);
    mocks.from.mockImplementation((table: string) => table === "external_teams" ? team : assignments);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.addAssignment.mutateAsync({ ...payload, executor_type: "esterno", employee_id: null as null, external_team_id: "team" })).rejects.toThrow(/ditta esterna/);
    expect(assignments.insert).not.toHaveBeenCalled();
    expect(team.eq).toHaveBeenCalledWith("company_id", "company");
  });
  it("mantiene il salvataggio delle ditte esterne attive", async () => {
    const team = builder({ data: { id: "team", kind: "esterna", is_active: true }, error: null as null });
    const assignments = builder(null);
    mocks.from.mockImplementation((table: string) => table === "external_teams" ? team : assignments);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync({ ...payload, executor_type: "esterno", employee_id: null as null, external_team_id: "team" });
    expect(assignments.insert).toHaveBeenCalledOnce();
  });
  it("una persona messa su una fase: il browser salva solo il lavoro, l'accesso all'app lo dà il database", async () => {
    const labor = builder(null); const altro = builder(null);
    mocks.from.mockImplementation((table: string) => table === "order_employees" ? labor : altro);
    mocks.rpc.mockResolvedValueOnce({ data: "riga", error: null });
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync(payload);
    // Dalla funzione del server, che controlla «Modifica commesse» e calcola tariffa e previsto (14/11/2026).
    expect(mocks.rpc).toHaveBeenCalledWith("commessa_assegna_persona", { p_order_id: "order", p_employee_id: "employee", p_user_id: null, p_phase_id: "phase", p_planned_hours: null });
    expect(labor.insert).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith("order_campo_assignments");
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["order-campo-assignments", "order"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-lavori-assegnati"] });
  });
  it("chi non ha «Modifica commesse» legge il permesso che manca, non un errore generico (14/11/2026)", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Assegnare le persone alla commessa lo fa chi ha il permesso «Modifica commesse». Chiedi al titolare dell'azienda di darti l'accesso." } });
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.addAssignment.mutateAsync(payload)).rejects.toThrow(/«Modifica commesse»/);
    expect(mocks.error).toHaveBeenCalledWith(expect.stringMatching(/«Modifica commesse»/));
  });
  it("la nota rifiutata per «Costi e Personale» non annulla l'assegnazione e lo dice", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "riga", error: null });
    const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn().mockResolvedValue({ data: null, error: { message: "Il dato «note» lo cambia solo chi ha il permesso «Costi e Personale»." } }) };
    q.update.mockReturnValue(q); q.eq.mockReturnValue(q);
    mocks.from.mockReturnValue(q);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync({ ...payload, notes: "porta il trapano" });
    expect(q.update).toHaveBeenCalledWith({ notes: "porta il trapano" });
    expect(q.eq).toHaveBeenCalledWith("id", "riga");
    expect(mocks.warning).toHaveBeenCalledWith("Persona assegnata, ma la nota non è stata salvata", { description: expect.stringMatching(/«Costi e Personale»/) });
  });
  it("avvisa in parole semplici se la persona non ha l'app", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "riga", error: null });
    const labor = builder(null);
    mocks.from.mockReturnValue(labor);
    mocks.employees = [{ id: "employee", label: "Mario Rossi", campoUserId: null }];
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync(payload);
    expect(mocks.warning).toHaveBeenCalledWith("Mario Rossi è al lavoro, ma non ha l'app", expect.objectContaining({ description: expect.stringContaining("Non vedrà questa commessa sul telefono") }));
    mocks.employees = undefined;
  });
  it("non tenta di creare accessi se la riga di manodopera non viene salvata", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "errore primario" } });
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.addAssignment.mutateAsync({ ...payload, notes: "nota" })).rejects.toThrow("errore primario");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
