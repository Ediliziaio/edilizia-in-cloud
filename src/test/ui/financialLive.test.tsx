import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { useFinancialLive } from "@/hooks/useFinancialLive";

const state = vi.hoisted(() => ({ company: "a", fingerprint: "1", rpc: vi.fn(), channels: [] as Array<{ name: string; filter: unknown; change: () => void; status: (s: string) => void }>, remove: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: state.company } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: state.rpc, removeChannel: state.remove,
  channel: (name: string) => {
    const record = { name, filter: null as unknown, change: () => {}, status: (_s: string) => {} };
    state.channels.push(record);
    const channel = {
      on: (_type: string, filter: unknown, change: () => void) => { record.filter = filter; record.change = change; return channel; },
      subscribe: (status: (s: string) => void) => { record.status = status; return channel; },
    };
    return channel;
  },
} }));
let client: QueryClient;
let stop: () => void;
let fetchData: Mock<() => Promise<unknown[]>>;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const advance = async (ms = 350) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers(); state.company = "a"; state.fingerprint = "1"; state.channels = []; state.remove.mockReset();
  state.rpc.mockReset().mockImplementation(async () => ({ data: state.fingerprint, error: null }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  fetchData = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
  const observer = new QueryObserver(client, { queryKey: ["scadenzario", "a"], queryFn: fetchData });
  stop = observer.subscribe(() => {});
});
afterEach(async () => { cleanup(); await act(async () => { await Promise.resolve(); }); stop(); client.clear(); vi.useRealTimers(); });

it("riceve il cambiamento da un altro client e aggiorna gli osservatori finanziari", async () => {
  renderHook(useFinancialLive, { wrapper }); await advance(); fetchData.mockClear(); state.rpc.mockClear();
  expect(state.channels[0].filter).toEqual({ event: "INSERT", schema: "public", table: "finanza_revisioni", filter: "company_id=eq.a" });
  state.fingerprint = "2"; state.channels[0].change(); await advance();
  expect(state.rpc).toHaveBeenCalledWith("finanza_revisione", { p_company_id: "a" });
  expect(fetchData).toHaveBeenCalledTimes(1);
});
it("heartbeat e ritorno sulla scheda non ricaricano i dati quando l'impronta è invariata", async () => {
  renderHook(useFinancialLive, { wrapper }); await advance(); fetchData.mockClear(); state.rpc.mockClear();
  await advance(30_000); window.dispatchEvent(new Event("focus")); await advance();
  expect(state.rpc).toHaveBeenCalled(); expect(fetchData).not.toHaveBeenCalled();
});
it("condivide il canale e chiude listener e timer quando esce l'ultimo lettore", async () => {
  const first = renderHook(useFinancialLive, { wrapper }); const second = renderHook(useFinancialLive, { wrapper }); await advance();
  expect(state.channels).toHaveLength(1);
  first.unmount(); await advance(); expect(state.remove).not.toHaveBeenCalled();
  second.unmount(); await advance(); expect(state.remove).toHaveBeenCalledTimes(1);
  state.rpc.mockClear(); window.dispatchEvent(new Event("focus")); await advance(31_000); expect(state.rpc).not.toHaveBeenCalled();
});
it("al cambio azienda abbandona il canale precedente e usa il nuovo ambito", async () => {
  const hook = renderHook(useFinancialLive, { wrapper }); await advance();
  state.company = "b"; hook.rerender(); await advance();
  expect(state.remove).toHaveBeenCalledTimes(1); expect(state.channels.map(c => c.name)).toEqual(["finanza-live:a", "finanza-live:b"]);
  expect(state.rpc).toHaveBeenLastCalledWith("finanza_revisione", { p_company_id: "b" });
});
it("recupera un evento perso alla riconnessione e non interroga pagine senza lettori finanziari", async () => {
  renderHook(useFinancialLive, { wrapper }); await advance(); fetchData.mockClear();
  state.fingerprint = "2"; state.channels[0].status("SUBSCRIBED"); await advance(); expect(fetchData).toHaveBeenCalledTimes(1);
  stop(); state.rpc.mockClear(); state.channels[0].change(); await advance(31_000); expect(state.rpc).not.toHaveBeenCalled();
});
