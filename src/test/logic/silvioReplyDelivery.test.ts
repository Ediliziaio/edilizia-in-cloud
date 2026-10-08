import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mock = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn(), filters: [] as [string, unknown][] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mock.invoke },
  from: () => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { mock.filters.push([key, value]); return query; },
      order: () => query, limit: () => query, abortSignal: () => query,
      maybeSingle: () => mock.read(),
    };
    return query;
  },
} }));
import { invokeSilvioWithRecovery } from "@/lib/silvio/replyDelivery";

const message = { id: "reply", channel_id: "channel-a", sender_id: "silvio", reply_to_id: "question-a",
  content: "Risposta pronta", created_at: "2026-10-07T10:00:00Z", message_type: "text", streaming: false };
function options() {
  return { functionName: "silvio-chat", body: { channel_id: "channel-a", message: "Domanda" },
    requestMessageId: "question-a", senderId: "silvio", onMessage: vi.fn(), onRecovering: vi.fn() };
}

describe("Silvio: risposta salvata senza ricaricare o reinviare", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); mock.filters = [];
    mock.read.mockResolvedValue({ data: null, error: null });
    mock.invoke.mockImplementation(() => new Promise(() => {}));
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("recupera la risposta dopo il timeout HTTP a 60s con una sola invocazione", async () => {
    mock.invoke.mockImplementation(() => new Promise((r) => setTimeout(() => r({ data: null, error: new Error("Failed to send request") }), 60_000)));
    const o = options(); const result = invokeSilvioWithRecovery(o);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(o.onRecovering).toHaveBeenCalledOnce();
    mock.read.mockResolvedValue({ data: message, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await result).data?.message_id).toBe("reply");
    expect(o.onMessage).toHaveBeenCalledWith(message);
    expect(mock.invoke).toHaveBeenCalledOnce();
    expect(mock.invoke.mock.calls[0][1].body.request_message_id).toBe("question-a");
    expect(mock.filters).toContainEqual(["channel_id", "channel-a"]);
    expect(mock.filters).toContainEqual(["reply_to_id", "question-a"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mostra le parti mentre HTTP è ancora aperto e completa senza Realtime", async () => {
    const o = options(); const settled = vi.fn();
    const result = invokeSilvioWithRecovery(o).then((r) => { settled(); return r; });
    mock.read.mockResolvedValue({ data: { ...message, content: "Prima parte", streaming: true }, error: null });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(o.onMessage).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    mock.read.mockResolvedValue({ data: message, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await result).error).toBeNull();
    expect(o.onMessage).toHaveBeenCalledTimes(2);
    expect(mock.invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each([
    { channel_id: "other" }, { sender_id: "other" }, { reply_to_id: "another-question" },
  ])("non usa risposte estranee: %j", async (wrong) => {
    const ac = new AbortController(); const o = options();
    const result = invokeSilvioWithRecovery({ ...o, signal: ac.signal }).catch((e) => e);
    mock.read.mockResolvedValue({ data: { ...message, ...wrong }, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(o.onMessage).not.toHaveBeenCalled();
    ac.abort(); expect((await result).name).toBe("AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("non confonde una vecchia risposta con la rigenerazione richiesta", async () => {
    const o = options(); const result = invokeSilvioWithRecovery({ ...o, ignoreMessageIds: ["reply"] });
    mock.read.mockResolvedValue({ data: message, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(o.onMessage).not.toHaveBeenCalled();
    mock.read.mockResolvedValue({ data: { ...message, id: "new-reply" }, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await result).data?.message_id).toBe("new-reply");
  });

  it("rende subito gli errori di permessi, senza mascherarli da elaborazione", async () => {
    const error = Object.assign(new Error("Forbidden"), { context: new Response(null, { status: 403 }) });
    mock.invoke.mockResolvedValue({ data: null, error });
    const o = options();
    expect((await invokeSilvioWithRecovery(o)).error).toBe(error);
    expect(o.onRecovering).not.toHaveBeenCalled();
    expect(mock.read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("mantiene ok:false per credito finito e altri errori applicativi", async () => {
    const data = { ok: false, error: "credito_esaurito" };
    mock.invoke.mockResolvedValue({ data, error: null });
    expect((await invokeSilvioWithRecovery(options())).data).toEqual(data);
  });

  it("mostra direttamente il messaggio confermato da HTTP senza attendere Realtime", async () => {
    const o = options();
    mock.invoke.mockResolvedValue({ data: { ok: true, message }, error: null });
    await invokeSilvioWithRecovery(o);
    expect(o.onMessage).toHaveBeenCalledWith(message);
    expect(mock.read).not.toHaveBeenCalled();
  });

  it("non invoca nulla se Stop era già stato premuto", async () => {
    const ac = new AbortController(); ac.abort();
    await expect(invokeSilvioWithRecovery({ ...options(), signal: ac.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, {}, { ok: true }, { reply: "Solo testo non ancora consegnato" },
    { message: { ...message, content: "" } }, { message: { ...message, content: 123 } },
    { message: { ...message, reply_to_id: "other" } },
  ])("continua il recupero dopo HTTP 200 senza risposta completa: %j", async data => {
    mock.invoke.mockResolvedValue({ data, error: null });
    const o = options(); const settled = vi.fn();
    const result = invokeSilvioWithRecovery(o).then(r => { settled(); return r; });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(settled).not.toHaveBeenCalled();
    mock.read.mockResolvedValue({ data: message, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await result).data?.message_id).toBe("reply");
    expect(mock.invoke).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("deduplica lo stesso frammento ricevuto da HTTP e lettura, aspettando il finale", async () => {
    const partial = { ...message, content: "Prima parte", streaming: true };
    mock.invoke.mockResolvedValue({ data: { ok: true, message: partial }, error: null });
    mock.read.mockResolvedValue({ data: partial, error: null });
    const o = options(); const result = invokeSilvioWithRecovery(o);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(o.onMessage).toHaveBeenCalledOnce();
    mock.read.mockResolvedValue({ data: message, error: null });
    await vi.advanceTimersByTimeAsync(2_000); await result;
    expect(o.onMessage).toHaveBeenCalledTimes(2);
  });

  it("ignora la vecchia risposta anche quando arriva nel risultato HTTP", async () => {
    mock.invoke.mockResolvedValue({ data: { ok: true, message }, error: null });
    const o = options(); const result = invokeSilvioWithRecovery({ ...o, ignoreMessageIds: [message.id] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(o.onMessage).not.toHaveBeenCalled();
    mock.read.mockResolvedValue({ data: { ...message, id: "new" }, error: null });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await result).data?.message_id).toBe("new");
  });

  it("un errore di lettura temporaneo non reinvia la domanda", async () => {
    mock.read.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: message, error: null });
    const o = options(); const result = invokeSilvioWithRecovery(o);
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await result).data?.message_id).toBe("reply");
    expect(mock.invoke).toHaveBeenCalledOnce();
  });

  it("interrompe anche una lettura pendente allo stop; una lettura tardiva non aggiorna la UI", async () => {
    let deliver!: (v: unknown) => void;
    mock.read.mockImplementation(() => new Promise((r) => { deliver = r; }));
    const ac = new AbortController(); const o = options();
    const result = invokeSilvioWithRecovery({ ...o, signal: ac.signal }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(2_000); ac.abort();
    deliver({ data: message, error: null }); await Promise.resolve();
    expect((await result).name).toBe("AbortError");
    expect(o.onMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("termina il recupero a tempo finito, senza false conferme o reinvii", async () => {
    mock.invoke.mockResolvedValue({ data: null, error: new Error("network") });
    const result = invokeSilvioWithRecovery(options()).catch((e) => e);
    await vi.advanceTimersByTimeAsync(240_000);
    expect((await result).message).toContain("Non riesco a confermare");
    expect(mock.invoke).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("i tre ingressi usano la stessa consegna e invalidano anche in errore", () => {
    for (const path of ["src/pages/azienda/SilvioAIPage.tsx", "src/components/silvio/SilvioChatSheet.tsx", "src/pages/azienda/InternalChat.tsx"]) {
      const text = readFileSync(resolve(path), "utf8");
      expect(text).toContain("await invokeSilvioWithRecovery({");
      expect(text).toContain("id: requestMessageId");
      expect(text).toMatch(/(?:onSettled:[\s\S]*?|finally\s*\{)[\s\S]*?invalidateQueries/);
    }
    for (const path of ["supabase/functions/silvio-chat/index.ts", "supabase/functions/silvio-admin-chat/index.ts"]) {
      const text = readFileSync(resolve(path), "utf8");
      expect(text).toContain('const replyLink = requestMessageId ? { reply_to_id: requestMessageId } : {};');
      expect(text).toMatch(/eq\("id", requestMessageId\)[\s\S]*?eq\("channel_id", channelId\)[\s\S]*?eq\("company_id",[\s\S]*?eq\("sender_id", userId\)/);
    }
  });
});
