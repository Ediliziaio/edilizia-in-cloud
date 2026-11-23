import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { useFinancialLive } from "@/hooks/useFinancialLive";

const state = vi.hoisted(() => ({ company: "a", fingerprint: "1", rpc: vi.fn(), channels: [] as Array<{ name: string; filter: unknown; change: () => void; status: (s: string) => void }>, remove: vi.fn(), aperti: new Map<string, unknown>() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: state.company } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: state.rpc, removeChannel: state.remove,
  // Come supabase-js: un nome già aperto restituisce lo stesso canale, e on() dopo subscribe() lancia.
  channel: (name: string) => {
    const esistente = state.aperti.get(name);
    if (esistente) return esistente;
    const record = { name, filter: null as unknown, change: () => {}, status: (_s: string) => {} };
    state.channels.push(record);
    let iscritto = false;
    const channel = {
      on: (_type: string, filter: unknown, change: () => void) => {
        if (iscritto) throw new Error(`cannot add \`postgres_changes\` callbacks for realtime:${name} after \`subscribe()\`.`);
        record.filter = filter; record.change = change; return channel;
      },
      subscribe: (status: (s: string) => void) => { iscritto = true; record.status = status; return channel; },
    };
    state.aperti.set(name, channel);
    return channel;
  },
} }));
let client: QueryClient;
let stop: () => void;
let fetchData: Mock<() => Promise<unknown[]>>;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const advance = async (ms = 350) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers(); state.company = "a"; state.fingerprint = "1"; state.channels = []; state.aperti = new Map(); state.remove.mockReset();
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
  expect(state.remove).toHaveBeenCalledTimes(1); expect(state.channels.map(c => c.name.split(":").slice(0, 2).join(":"))).toEqual(["finanza-live:a", "finanza-live:b"]);
  expect(state.rpc).toHaveBeenLastCalledWith("finanza_revisione", { p_company_id: "b" });
});
it("recupera un evento perso alla riconnessione e non interroga pagine senza lettori finanziari", async () => {
  renderHook(useFinancialLive, { wrapper }); await advance(); fetchData.mockClear();
  state.fingerprint = "2"; state.channels[0].status("SUBSCRIBED"); await advance(); expect(fetchData).toHaveBeenCalledTimes(1);
  stop(); state.rpc.mockClear(); state.channels[0].change(); await advance(31_000); expect(state.rpc).not.toHaveBeenCalled();
});

it("una riapertura mentre il canale precedente si sta ancora chiudendo non rompe l'app", async () => {
  // Come supabase-js: channel() con un nome già usato restituisce lo stesso canale, e on() dopo
  // subscribe() lancia. Prima il nome era fisso e una riapertura veloce faceva crollare tutto.
  const iscritti = new Set<string>();
  const originale = state.channels;
  const prova = renderHook(useFinancialLive, { wrapper }); await advance();
  const nome = originale[0].name;
  iscritti.add(nome);
  prova.unmount(); await act(async () => { await Promise.resolve(); });
  state.company = "a";
  expect(() => renderHook(useFinancialLive, { wrapper })).not.toThrow();
  await advance();
  expect(state.channels.length).toBe(2);
  expect(state.channels[1].name).not.toBe(nome);
  expect(state.channels[1].name.startsWith("finanza-live:a:")).toBe(true);
});
