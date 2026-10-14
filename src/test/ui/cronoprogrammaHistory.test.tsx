import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {act, cleanup, renderHook, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {ReactNode} from "react";
import {useCronoprogramma} from "@/hooks/useCronoprogramma";
import {refreshRapportinoFromOrderEvent} from "@/lib/orders/refreshRapportinoQueries";
const m = vi.hoisted(() => ({rows: [] as object[], errorOffset: -1, calls: [] as {filters: Record<string, unknown>; order: string[]; range: number[]; signal?: AbortSignal}[]}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({effectiveCompany: {id: "c"}})}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: () => {
  const call = {filters: {} as Record<string, unknown>, order: [] as string[], range: [] as number[], signal: undefined as AbortSignal | undefined}; m.calls.push(call);
  const q = {select: () => q, eq: (key: string, value: unknown) => {call.filters[key] = value; return q;}, in: (key: string, value: unknown) => {call.filters[key] = value; return q;}, order: (key: string) => {call.order.push(key); return q;}, range: (from: number, to: number) => {call.range = [from, to]; return q;}, abortSignal: (signal: AbortSignal) => {call.signal = signal; return q;},
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({data: m.rows.slice(call.range[0], call.range[1] + 1), error: call.range[0] === m.errorOffset ? new Error("Pagina non disponibile") : null}).then(resolve, reject)};
  return q;
}}}));
let qc: QueryClient;
beforeEach(() => {m.rows = []; m.calls = []; m.errorOffset = -1; qc = new QueryClient({defaultOptions: {queries: {retry: false}}});});
afterEach(() => {cleanup(); qc.clear();});
const wrapper = ({children}: {children: ReactNode}) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const rows = (n: number) => Array.from({length: n}, (_, i) => ({id: String(i), data_lavoro: "2026-10-12", stato: "inviato", fasi_lavorate: [{phase_id: "f", ore: 1}]}));
it("un cantiere piccolo fa una sola lettura mirata, senza count o polling", async () => {
  m.rows = rows(20); const hook = renderHook(() => useCronoprogramma("o", null), {wrapper});
  await waitFor(() => expect(hook.result.current.rapportini).toHaveLength(20));
  expect(m.calls).toHaveLength(1); expect(m.calls[0]).toMatchObject({filters: {company_id: "c", order_id: "o", stato: ["inviato", "approvato"]}, order: ["data_lavoro", "id"], range: [0, 499]});
  expect(m.calls[0].signal).toBeInstanceOf(AbortSignal);
});
it("non perde i rapportini dopo la millesima riga", async () => {
  m.rows = rows(1201); const hook = renderHook(() => useCronoprogramma("o", null), {wrapper});
  await waitFor(() => expect(hook.result.current.rapportini).toHaveLength(1201));
  expect(m.calls.map(c => c.range)).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  expect(m.calls.every(c => c.filters.company_id === "c" && c.filters.order_id === "o")).toBe(true);
});
it("un errore a metà storico non espone dati parziali come consuntivo completo", async () => {
  m.rows = rows(1201); m.errorOffset = 500; const hook = renderHook(() => useCronoprogramma("o", null), {wrapper});
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.rapportini).toEqual([]); expect(m.calls).toHaveLength(2);
  m.errorOffset = -1; await act(async () => {await hook.result.current.refetch();});
  await waitFor(() => expect(hook.result.current.isError).toBe(false)); expect(hook.result.current.rapportini).toHaveLength(1201);
});
it("un evento del Campo aggiorna il cronoprogramma aperto senza toccare altre aziende", async () => {
  m.rows = rows(1); const hook = renderHook(() => useCronoprogramma("o", null), {wrapper});
  await waitFor(() => expect(hook.result.current.rapportini).toHaveLength(1));
  qc.setQueryData(["cronoprogramma-rapportini", "o", "altra"], []);
  m.rows = rows(2);
  act(() => {refreshRapportinoFromOrderEvent(qc, "c", "o", {company_id: "c", order_id: "o", event_type: "reportino_cantiere"});});
  await waitFor(() => expect(hook.result.current.rapportini).toHaveLength(2));
  expect(qc.getQueryState(["cronoprogramma-rapportini", "o", "altra"])?.isInvalidated).toBe(false);
});
