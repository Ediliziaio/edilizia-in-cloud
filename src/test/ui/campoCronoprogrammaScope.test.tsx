import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useCronoprogramma } from "@/hooks/useCronoprogramma";

const state = vi.hoisted(() => ({ company: "c", calls: [] as { table: string; filters: Record<string, unknown> }[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: state.company ? { id: state.company } : null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call = { table, filters: {} as Record<string, unknown> }; state.calls.push(call);
  const result = (): { error: null; data: unknown } => ({ error: null, data: table === "quotes" ? { signed_at: call.filters.company_id === "c" ? "2026-10-01" : "2026-10-02" } :
    [{ data_lavoro: call.filters.company_id === "c" ? "2026-10-01" : "2026-10-02", stato: "inviato", fasi_lavorate: [] as unknown[] }] });
  const q = { select: () => q, eq: (key: string, value: unknown) => { call.filters[key] = value; return q; },
    in: () => q, order: () => q, range: () => q, abortSignal: () => q, maybeSingle: async () => result(),
    then: (yes: (r: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve(result()).then(yes, no),
  }; return q;
} } }));
let qc: QueryClient;
beforeEach(() => { state.company = "c"; state.calls = []; qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); qc.clear(); });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

it("un cambio azienda rilegge rapportini e firma, senza riutilizzare la cache dell'altra", async () => {
  const hook = renderHook(() => useCronoprogramma("o", "q"), { wrapper });
  await waitFor(() => expect(hook.result.current.firmaPreventivo).toBe("2026-10-01"));
  expect(hook.result.current.rapportini[0].data_lavoro).toBe("2026-10-01");
  state.company = "altra"; hook.rerender();
  expect(hook.result.current.rapportini).toEqual([]);
  expect(hook.result.current.firmaPreventivo).toBeNull();
  await waitFor(() => expect(hook.result.current.firmaPreventivo).toBe("2026-10-02"));
  expect(hook.result.current.rapportini[0].data_lavoro).toBe("2026-10-02");
  expect(qc.getQueryData(["cronoprogramma-rapportini", "o", "c"])).toBeDefined();
  expect(qc.getQueryData(["cronoprogramma-rapportini", "o", "altra"])).toBeDefined();
  expect(state.calls.every(call => typeof call.filters.company_id === "string")).toBe(true);
});

it("senza azienda non legge né rapportini né preventivi", () => {
  state.company = ""; const hook = renderHook(() => useCronoprogramma("o", "q"), { wrapper });
  expect(state.calls).toEqual([]); expect(hook.result.current.rapportini).toEqual([]);
});
