import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePrimaNota } from "@/hooks/usePrimaNota";

const state = vi.hoisted(() => ({
  fail: false, filters: [] as unknown[][], riepiloghi: [] as Record<string, unknown>[],
  attesaMovimenti: null as Promise<void> | null,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (_nome: string, parametri: Record<string, unknown>) => {
    state.riepiloghi.push(parametri);
    return { abortSignal: () => Promise.resolve({
      data: [{ mese: parametri.p_monthly ? "2026-11-01" : null, entrate: 110, uscite: 50, saldo: 60, entry_count: 2300 }],
      error: null,
    }) };
  },
  from: () => {
    let storni = false;
    const q: Record<string, unknown> = {};
    q.select = (s: string) => { storni = s === "reversal_of"; return q; };
    q.eq = (...args: unknown[]) => { if (storni) state.filters.push(args); return q; };
    q.in = (...args: unknown[]) => { state.filters.push(args); return q; };
    for (const k of ["gte", "lte", "ilike", "order", "range", "abortSignal"]) q[k] = () => q;
    q.then = async (resolve: (data: unknown) => unknown) => {
      if (!storni) await state.attesaMovimenti;
      return resolve({
        data: storni ? [{ reversal_of: "pagamento" }] : [{ id: "pagamento", cost_id: "c1", direction: "uscita", amount: 50, entry_date: "2026-11-19" }],
        count: 1, error: storni && state.fail ? { message: "Rete assente" } : null,
      });
    };
    return q;
  },
} }));
beforeEach(() => { state.fail = false; state.filters = []; state.riepiloghi = []; state.attesaMovimenti = null; });
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
it("invia tutti i filtri del saldo e su mobile fa una sola richiesta di riepilogo", async () => {
  const { result } = renderHook(() => usePrimaNota({
    fromDate: "2026-11-19", direction: "uscita", search: "  materiale ", category: "costo",
    isAuto: false, autoSource: "fornitore", bankAccountId: "b1", liquiditaId: "l1", accountLabel: "cassa",
  }, 1, 50, { includeMonthlyChart: false }), { wrapper });
  await waitFor(() => expect(result.current.saldo?.entry_count).toBe(2300));
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  expect(state.riepiloghi).toHaveLength(1);
  expect(state.riepiloghi[0]).toMatchObject({
    p_company_id: "demo", p_from_date: "2026-11-19", p_direction: "uscita", p_category: "costo",
    p_description_pattern: "%materiale%", p_is_auto: false, p_auto_source: "fornitore",
    p_bank_account_id: "b1", p_conto_liquidita_id: "l1", p_account_label_pattern: "cassa%",
  });
});

it("il grafico aspetta i movimenti e mantiene solo il filtro del conto", async () => {
  let completa = () => {};
  state.attesaMovimenti = new Promise<void>(resolve => { completa = resolve; });
  const { result } = renderHook(() => usePrimaNota({ direction: "uscita", bankAccountId: "b1" }), { wrapper });
  await waitFor(() => expect(result.current.saldo).toBeDefined());
  expect(state.riepiloghi.some(f => f.p_monthly)).toBe(false);
  await act(async () => completa());
  await waitFor(() => expect(result.current.monthlyChart?.["2026-11"]).toEqual({ entrate: 110, uscite: 50 }));
  const grafico = state.riepiloghi.find(f => f.p_monthly);
  expect(grafico).toMatchObject({ p_company_id: "demo", p_bank_account_id: "b1" });
  expect(grafico).not.toHaveProperty("p_direction");
});
