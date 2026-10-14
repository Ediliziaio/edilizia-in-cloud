import "@testing-library/jest-dom/vitest";
import {cleanup, renderHook} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {useOrderWorkPhases} from "@/hooks/useOrderWorkPhases";
const m = vi.hoisted(() => ({company: "c", configs: [] as {queryKey: unknown[]; queryFn: () => Promise<unknown>}[], calls: [] as {table: string; select: string; filters: Record<string, unknown>}[]}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: m.company}, user: {id: "u"}})}));
vi.mock("@tanstack/react-query", () => ({useQuery: (config: {queryKey: unknown[]; queryFn: () => Promise<unknown>}) => {m.configs.push(config); return {data: undefined as undefined};}, useQueryClient: () => ({invalidateQueries: vi.fn()}), useMutation: () => ({mutate: vi.fn(), mutateAsync: vi.fn()})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: (table: string) => {
  const call = {table, select: "", filters: {} as Record<string, unknown>}; m.calls.push(call);
  const data = table === "order_work_phases" ? [{id: "p", order_id: "o", name: "Posa", status: "completata"}] : table === "order_employees" ? [{id: "a", employee_id: "archived", phase_id: "p", employee: {first_name: "Mario", last_name: "Storico", is_active: false}, total_cost: 80}] : [];
  const q = {select: (s: string) => {call.select = s; return q;}, eq: (key: string, value: unknown) => {call.filters[key] = value; return q;}, order: () => q, then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({data, error: null}).then(resolve, reject)}; return q;
}}}));
beforeEach(() => {m.company = "c"; m.configs = []; m.calls = [];}); afterEach(cleanup);
it("legge il nominativo storico insieme alla riga e limita le tre letture all'azienda", async () => {
  renderHook(() => useOrderWorkPhases("o")); const query = m.configs.find(q => q.queryKey[0] === "order_work_phases")!;
  expect(query.queryKey).toEqual(["order_work_phases", "o", "c"]);
  const result = await query.queryFn() as {all: {executor_label: string; executor_inactive: boolean; cost_consuntivo: number}[]};
  expect(result.all[0]).toMatchObject({executor_label: "Mario Storico", executor_inactive: true, cost_consuntivo: 80});
  expect(m.calls.find(c => c.table === "order_employees")?.filters).toMatchObject({order_id: "o", "orders.company_id": "c", "employee.company_id": "c"});
  expect(m.calls.find(c => c.table === "order_external_teams")?.filters).toMatchObject({"orders.company_id": "c", "team.company_id": "c"});
  expect(m.calls.find(c => c.table === "order_work_phases")?.filters.company_id).toBe("c");
});
it("il cambio azienda cambia anche la chiave della cache del piano operativo", () => {
  const hook = renderHook(() => useOrderWorkPhases("o")); m.company = "other"; hook.rerender();
  expect(m.configs.filter(q => q.queryKey[0] === "order_work_phases").at(-1)?.queryKey).toEqual(["order_work_phases", "o", "other"]);
});
