import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePrimaNota, type PrimaNotaEntry } from "@/hooks/usePrimaNota";
const state = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as PrimaNotaEntry[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: state.rpc,
  from: () => {
    let reversals = false;
    const q: Record<string, unknown> = {};
    q.select = (s: string) => { reversals = s === "reversal_of"; return q; };
    for (const key of ["eq", "in", "gte", "lte", "order", "range", "limit"]) q[key] = () => q;
    q.then = (resolve: (data: unknown) => unknown) => Promise.resolve({ data: reversals ? [] : state.rows, count: state.rows.length, error: null }).then(resolve);
    return q;
  },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const payment = { id: "p1", company_id: "demo", cost_id: "c1", direction: "uscita", amount: 50, is_auto: true, auto_source: "company_cost_payment", updated_at: "2026-11-19T10:11:12.123456+00:00" } as PrimaNotaEntry;
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); state.rows = [payment];
  state.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === "prima_nota_elimina_registrazione" ? { eliminati_ids: ["p1", "storno"] } : {}, error: null }));
});
afterEach(() => { cleanup(); client.clear(); });
async function open() { const h = renderHook(() => usePrimaNota(), { wrapper }); await waitFor(() => expect(h.result.current.entries).toHaveLength(state.rows.length)); return h; }
it("invia la versione esatta letta, compresi i microsecondi, alla cancellazione del singolo pagamento", async () => {
  const { result } = await open(); await act(async () => { await result.current.remove.mutateAsync("p1"); });
  expect(state.rpc).toHaveBeenCalledWith("prima_nota_elimina_registrazione", { p_id: "p1", p_versione: payment.updated_at });
});
it("selezionare originale e storno non invoca due volte il pagamento già eliminato", async () => {
  state.rows.push({ ...payment, id: "storno", direction: "entrata", reversal_of: "p1", auto_source: "storno_pagamento" });
  const { result } = await open();
  const esito = await act(async () => result.current.removeMany.mutateAsync(state.rows));
  expect(esito.errori).toEqual([]); expect(esito.completate).toHaveLength(2);
  expect(state.rpc.mock.calls.filter(([name]) => name === "prima_nota_elimina_registrazione")).toHaveLength(1);
});
it("elabora l'originale prima dello storno selezionato per primo, anche se il costo è annullato", async () => {
  state.rows.unshift({ ...payment, id: "storno", direction: "entrata", reversal_of: "p1", auto_source: "storno_pagamento" });
  state.rpc.mockImplementation(async (name: string, args?: { p_id?: string }) => ({
    data: name === "prima_nota_elimina_registrazione" ? { eliminati_ids: ["p1", "storno"] } : {},
    error: name === "prima_nota_elimina_registrazione" && args?.p_id === "storno" ? { code: "P0001", message: "Il costo è annullato: elimina il pagamento originale insieme al relativo storno." } : null,
  }));
  const { result } = await open();
  const esito = await act(async () => result.current.removeMany.mutateAsync(state.rows));
  expect(esito.errori).toEqual([]); expect(esito.completate).toHaveLength(2);
  expect(state.rpc.mock.calls.filter(([name]) => name === "prima_nota_elimina_registrazione").map(([, args]) => args.p_id)).toEqual(["p1"]);
});
it("mostra il conflitto di versione come riga non eliminata e permette di conservare la selezione", async () => {
  const { result } = await open();
  state.rpc.mockImplementation(async (name: string) => ({ data: {}, error: name === "prima_nota_elimina_registrazione" ? { code: "PT409", message: "La registrazione è cambiata. Ricaricala prima di eliminarla." } : null }));
  const esito = await act(async () => result.current.removeMany.mutateAsync([payment]));
  expect(esito.completate).toEqual([]); expect(esito.errori[0].riga.id).toBe("p1"); expect(esito.errori[0].motivo).toContain("cambiata");
});
