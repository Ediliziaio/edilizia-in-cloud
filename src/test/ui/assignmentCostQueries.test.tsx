import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAssignmentHourlyCost } from "@/hooks/useAssignmentHourlyCost";
import { useOrderSubcontractStatistics } from "@/hooks/useOrderSubcontractStatistics";
const m = vi.hoisted(() => ({companyId: "c", permission: {canViewCosts: true, canViewEmployees: true, isLoading: false}, from: vi.fn()}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: m.companyId}})}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => m.permission}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: m.from}}));
const clients: QueryClient[] = [];
let fail = false, full = false;
const reads: Array<{table: string; fields: string; filters: Record<string, unknown>; limit?: number}> = [];
function wrapper({children}: {children: ReactNode}) {
  const qc = new QueryClient({defaultOptions: {queries: {retry: false}}}); clients.push(qc);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks(); reads.length = 0; fail = false; full = false; m.companyId = "c";
  Object.assign(m.permission, {canViewCosts: true, canViewEmployees: true, isLoading: false});
  m.from.mockImplementation((table: string) => {
    const record = {table, fields: "", filters: {} as Record<string, unknown>, limit: undefined as number | undefined};
    const resolve = () => {
      reads.push(record);
      const data = table === "employees" ? {id: "e", user_id: null as string | null, costo_orario: record.filters.company_id === "c" ? 26 : 30} : full ? Array.from({length: 1000}, (_, i) => ({id: `${i}`})) : [] as unknown[];
      return {data: fail ? null : data, error: fail ? new Error("RLS/rete") : null};
    };
    const q = {select: (s: string) => {record.fields = s; return q;}, eq: (f: string, v: unknown) => {record.filters[f] = v; return q;}, limit: (n: number) => {record.limit = n; return q;}, maybeSingle: async () => resolve(), then: (fn: (v: unknown) => unknown) => Promise.resolve(resolve()).then(fn)};
    return q;
  });
});
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear());});
it("tariffa solo della persona selezionata e della propria azienda", async () => {
  const {result} = renderHook(() => useAssignmentHourlyCost("e"), {wrapper});
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(reads).toHaveLength(1); expect(reads[0].filters).toEqual({id: "e", company_id: "c", is_active: true});
  expect(result.current.data?.amount).toBe(26);
});
it("nessun dipendente selezionato non genera richieste", () => {
  renderHook(() => useAssignmentHourlyCost(undefined), {wrapper}); expect(m.from).not.toHaveBeenCalled();
});
it("senza permesso dipendenti non legge dati retributivi", () => {
  m.permission.canViewEmployees = false; const {result} = renderHook(() => useAssignmentHourlyCost("e"), {wrapper});
  expect(result.current.allowed).toBe(false); expect(m.from).not.toHaveBeenCalled();
});
it.each(["canViewCosts", "isLoading"] as const)("%s protegge tutte le letture economiche", key => {
  m.permission[key] = key === "isLoading"; renderHook(() => {useAssignmentHourlyCost("e"); return useOrderSubcontractStatistics("o");}, {wrapper});
  expect(m.from).not.toHaveBeenCalled();
});
it("contratti e SAL hanno due letture limitate, senza join che duplichino importi", async () => {
  const {result} = renderHook(() => useOrderSubcontractStatistics("o"), {wrapper});
  await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(reads).toHaveLength(2);
  for (const r of reads) {expect(r.filters).toEqual({company_id: "c", order_id: "o"}); expect(r.limit).toBe(1000); expect(r.fields).not.toContain("*");}
});
it("limite raggiunto non pubblica somme troncate", async () => {
  full = true; const {result} = renderHook(() => useOrderSubcontractStatistics("o"), {wrapper});
  await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
});
it("rete/RLS non viene interpretata come costo zero", async () => {
  fail = true; const {result} = renderHook(() => useAssignmentHourlyCost("e"), {wrapper});
  await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
});
it("cambio azienda non riusa la tariffa della vecchia azienda", async () => {
  const {result, rerender} = renderHook(() => useAssignmentHourlyCost("e"), {wrapper});
  await waitFor(() => expect(result.current.data?.amount).toBe(26)); m.companyId = "altra"; rerender();
  await waitFor(() => expect(result.current.data?.amount).toBe(30)); expect(reads.at(-1)?.filters.company_id).toBe("altra");
});
