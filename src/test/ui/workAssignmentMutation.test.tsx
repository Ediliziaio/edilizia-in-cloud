import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderWorkPhases, type AddAssignmentPayload } from "@/hooks/useOrderWorkPhases";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invalidate: vi.fn(), warning: vi.fn(), error: vi.fn(), employees: undefined as unknown, fasi: undefined as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
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
    const q = { update: vi.fn(), eq: vi.fn() };
    q.update.mockReturnValue(q);
    q.eq.mockResolvedValue({ error: null as null });
    mocks.from.mockReturnValue(q);
    return q;
  };

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
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync(payload);
    expect(labor.insert).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalledWith("order_campo_assignments");
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["order-campo-assignments", "order"] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-lavori-assegnati"] });
  });
  it("avvisa in parole semplici se la persona non ha l'app", async () => {
    const labor = builder(null);
    mocks.from.mockReturnValue(labor);
    mocks.employees = [{ id: "employee", label: "Mario Rossi", campoUserId: null }];
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync(payload);
    expect(mocks.warning).toHaveBeenCalledWith("Mario Rossi è al lavoro, ma non ha l'app", expect.objectContaining({ description: expect.stringContaining("Non vedrà questa commessa sul telefono") }));
    mocks.employees = undefined;
  });
  it("non tenta di creare accessi se la riga di manodopera non viene salvata", async () => {
    const labor = builder(null, { error: new Error("errore primario") }); mocks.from.mockReturnValue(labor);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.addAssignment.mutateAsync(payload)).rejects.toThrow("errore primario");
    expect(mocks.from).toHaveBeenCalledTimes(1); expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
