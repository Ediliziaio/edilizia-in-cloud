import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePrimaNota } from "@/hooks/usePrimaNota";

const state = vi.hoisted(() => ({ fail: false, filters: [] as unknown[][] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: () => Promise.resolve({ data: {}, error: null }),
  from: () => {
    let storni = false;
    const q: Record<string, unknown> = {};
    q.select = (s: string) => { storni = s === "reversal_of"; return q; };
    q.eq = (...args: unknown[]) => { if (storni) state.filters.push(args); return q; };
    q.in = (...args: unknown[]) => { state.filters.push(args); return q; };
    for (const k of ["gte", "lte", "order", "range"]) q[k] = () => q;
    q.then = (resolve: (data: unknown) => unknown) => Promise.resolve({
      data: storni ? [{ reversal_of: "pagamento" }] : [{ id: "pagamento", cost_id: "c1", direction: "uscita", amount: 50, entry_date: "2026-11-19" }],
      count: 1, error: storni && state.fail ? { message: "Rete assente" } : null,
    }).then(resolve);
    return q;
  },
} }));
beforeEach(() => { state.fail = false; state.filters = []; });
afterEach(cleanup);
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
it("riconosce lo storno anche se è fuori dal periodo e dalla pagina visibili", async () => {
  const { result } = renderHook(() => usePrimaNota({ fromDate: "2026-11-19", toDate: "2026-11-19" }, 1, 50), { wrapper });
  await waitFor(() => expect(result.current.entries[0]?.stornata).toBe(true));
  expect(state.filters).toContainEqual(["company_id", "demo"]);
  expect(state.filters).toContainEqual(["reversal_of", ["pagamento"]]);
});
it("un errore nello storico non presenta come stornabile un pagamento forse già stornato", async () => {
  state.fail = true;
  const { result } = renderHook(() => usePrimaNota(), { wrapper });
  await waitFor(() => expect(result.current.erroreElenco).toBe(true));
  expect(result.current.entries).toEqual([]);
});
