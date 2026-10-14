import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachCommessaCampoSync } from "@/hooks/useCommessaCampoSync";

type Payload = { new: Record<string, unknown>; old: Record<string, unknown> };
type Channel = { callbacks: Map<string, (payload: Payload) => void>; status?: (status: string) => void;
  on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
const state = vi.hoisted(() => ({ channels: [] as Channel[], remove: vi.fn(), fail: false }));
vi.mock("@/utils/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  channel: () => {
    if (state.fail) throw new Error("Canale non disponibile");
    const channel: Channel = { callbacks: new Map(), on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockImplementation((_kind, config, callback) => { channel.callbacks.set(config.table, callback); return channel; });
    channel.subscribe.mockImplementation(callback => { channel.status = callback; return channel; });
    state.channels.push(channel); return channel;
  },
  removeChannel: state.remove,
} }));
const releases: (() => void)[] = [], clients: QueryClient[] = [];
const client = () => { const qc = new QueryClient(); clients.push(qc); return qc; };
const attach = (qc: QueryClient, company = "c", order = "o") => { const release = attachCommessaCampoSync(qc, company, order); releases.push(release); return release; };
beforeEach(() => {
  vi.useFakeTimers(); state.channels = []; state.fail = false; state.remove.mockReset();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => { releases.splice(0).forEach(release => release()); clients.splice(0).forEach(qc => qc.clear()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Una sottoscrizione per commessa, condivisa fra header e diario", () => {
  it("header e diario non aprono due canali; l'ultimo smontaggio chiude anche il recupero", async () => {
    const qc = client(); const first = attach(qc), second = attach(qc);
    expect(state.channels).toHaveLength(1); first(); first(); expect(state.remove).not.toHaveBeenCalled();
    second(); expect(state.remove).toHaveBeenCalledOnce();
    const invalidate = vi.spyOn(qc, "invalidateQueries"); window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(240_000); expect(invalidate).not.toHaveBeenCalled();
  });
  it("aziende e commesse diverse hanno sottoscrizioni indipendenti", () => {
    const qc = client(); attach(qc); attach(qc, "c", "altra"); attach(qc, "altra", "o");
    expect(state.channels).toHaveLength(3);
    for (const channel of state.channels) {
      expect(channel.on.mock.calls.map(call => call[1].table)).toEqual(["order_events", "order_messages"]);
    }
  });
  it("un evento dell'operaio aggiorna anche i costi canonici e i contatori dell'ufficio", async () => {
    const qc = client(); const keys = [["order-campo-rapportini", "o", "c"], ["order-economics-canonical", "o"], ["order-conteggi-viste", "o", "c"]];
    keys.forEach(key => qc.setQueryData(key, [])); qc.setQueryData(["order-economics-canonical", "altra"], []); attach(qc);
    state.channels[0].callbacks.get("order_events")!({ new: { company_id: "c", order_id: "o", event_type: "reportino_cantiere" }, old: {} });
    await vi.advanceTimersByTimeAsync(350);
    keys.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
    expect(qc.getQueryState(["order-economics-canonical", "altra"])?.isInvalidated).toBe(false);
  });
  it("non applica un evento di un'altra azienda, nemmeno con la stessa commessa", async () => {
    const qc = client(); attach(qc); const invalidate = vi.spyOn(qc, "invalidateQueries");
    state.channels[0].callbacks.get("order_events")!({ new: { company_id: "altra", order_id: "o" }, old: {} });
    await vi.advanceTimersByTimeAsync(1_000); expect(invalidate).not.toHaveBeenCalled();
  });
  it("si riconcilia alla risottoscrizione, ma non duplica le richieste della prima apertura", async () => {
    const qc = client(); attach(qc); const invalidate = vi.spyOn(qc, "invalidateQueries");
    state.channels[0].status!("SUBSCRIBED"); await vi.advanceTimersByTimeAsync(350); expect(invalidate).not.toHaveBeenCalled();
    state.channels[0].status!("SUBSCRIBED"); await vi.advanceTimersByTimeAsync(350); expect(invalidate).toHaveBeenCalledOnce();
  });
  it("il fallimento Realtime lascia funzionante il recupero al ritorno nell'app", async () => {
    const qc = client(); state.fail = true; attach(qc); const invalidate = vi.spyOn(qc, "invalidateQueries");
    window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(350); expect(invalidate).toHaveBeenCalledOnce();
  });
});
