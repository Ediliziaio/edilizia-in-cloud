import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderWorkPhases, type AddAssignmentPayload } from "@/hooks/useOrderWorkPhases";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invalidate: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/utils/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { warning: mocks.warning, error: mocks.error } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined as undefined, isLoading: false, isError: false, refetch: vi.fn() }),
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
  it("conserva la manodopera e avvisa se l'inserimento dell'accesso fallisce", async () => {
    const labor = builder(null); const employee = builder({ data: { user_id: "user" }, error: null as null });
    const campo = builder({ data: null as null, error: null as null }, { error: { message: "policy" } });
    mocks.from.mockImplementation((table: string) => table === "order_employees" ? labor : table === "employees" ? employee : campo);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await result.current.addAssignment.mutateAsync(payload);
    expect(labor.insert).toHaveBeenCalledTimes(1);
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("accesso app Campo da verificare"), expect.any(Object));
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["campo-lavori-assegnati"] });
  });
  it("non duplica un accesso Campo già esistente", async () => {
    const labor = builder(null); const employee = builder({ data: { user_id: "user" }, error: null as null });
    const campo = builder({ data: { id: "existing" }, error: null as null });
    mocks.from.mockImplementation((table: string) => table === "order_employees" ? labor : table === "employees" ? employee : campo);
    const { result } = renderHook(() => useOrderWorkPhases("order")); await result.current.addAssignment.mutateAsync(payload);
    expect(campo.insert).not.toHaveBeenCalled(); expect(mocks.warning).not.toHaveBeenCalled();
  });
  it("non tenta di creare accessi se la riga di manodopera non viene salvata", async () => {
    const labor = builder(null, { error: new Error("errore primario") }); mocks.from.mockReturnValue(labor);
    const { result } = renderHook(() => useOrderWorkPhases("order"));
    await expect(result.current.addAssignment.mutateAsync(payload)).rejects.toThrow("errore primario");
    expect(mocks.from).toHaveBeenCalledTimes(1); expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
