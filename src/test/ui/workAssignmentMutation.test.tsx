import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderWorkPhases, type AddAssignmentPayload } from "@/hooks/useOrderWorkPhases";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invalidate: vi.fn(), warning: vi.fn(), error: vi.fn(), employees: undefined as unknown }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, error: mocks.error } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[0] === "employees_active" ? mocks.employees : undefined, isLoading: false, isError: false, refetch: vi.fn() }),
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
beforeEach(() => vi.clearAllMocks());

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
