import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { withAbortableClientTimeout, withClientTimeout } from "@/lib/query-timeout";

describe("timeout delle letture: interrompe il fetch, non solo l'attesa", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("annulla il signal al timeout e conserva il messaggio anche se il client risolve l'abort", async () => {
    let actualSignal!: AbortSignal;
    const task = withAbortableClientTimeout((signal) => {
      actualSignal = signal;
      return new Promise((resolve) => signal.addEventListener("abort", () => resolve({ error: "aborted" })));
    }, "Elenco", 1000);
    const check = expect(task).rejects.toThrow("Elenco: timeout dopo 1 secondi");
    await vi.advanceTimersByTimeAsync(1000);
    await check;
    expect(actualSignal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propaga l'annullamento del chiamante e rimuove il listener", async () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, "removeEventListener");
    let actualSignal!: AbortSignal;
    const task = withAbortableClientTimeout((signal) => {
      actualSignal = signal;
      return new Promise(() => {});
    }, "Elenco", 1000, parent.signal);
    const check = expect(task).rejects.toThrow("cambio azienda");
    await vi.advanceTimersByTimeAsync(0);
    parent.abort(new Error("cambio azienda"));
    await check;
    expect(actualSignal.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("non avvia una richiesta già annullata", async () => {
    const parent = new AbortController();
    parent.abort();
    const factory = vi.fn();
    await expect(withAbortableClientTimeout(factory, "Elenco", 1000, parent.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("non avvia il fetch se l'annullamento arriva prima della factory", async () => {
    const parent = new AbortController();
    const factory = vi.fn();
    const task = withAbortableClientTimeout(factory, "Elenco", 1000, parent.signal);
    parent.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("conserva risultato, pulisce timer e non annulla dopo il completamento", async () => {
    let actualSignal!: AbortSignal;
    await expect(withAbortableClientTimeout((signal) => {
      actualSignal = signal;
      return Promise.resolve(42);
    }, "Elenco", 1000)).resolves.toBe(42);
    await vi.advanceTimersByTimeAsync(2000);
    expect(actualSignal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("pulisce anche se la factory lancia un errore sincrono", async () => {
    await expect(withAbortableClientTimeout(() => { throw new Error("errore query"); })).rejects.toThrow("errore query");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passa davvero il signal fino al fetch del client Supabase installato", async () => {
    let fetchSignal!: AbortSignal;
    const client = createClient("https://example.supabase.co", "test-public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: vi.fn((_url, init) => {
        fetchSignal = init!.signal!;
        return new Promise<Response>((_resolve, reject) => fetchSignal.addEventListener("abort", () => reject(fetchSignal.reason)));
      }) },
    });
    const task = withAbortableClientTimeout((signal) => client.from("test_only").select("id").abortSignal(signal), "RPC", 1000);
    const check = expect(task).rejects.toThrow("RPC: timeout");
    await vi.advanceTimersByTimeAsync(1000);
    await check;
    expect(fetchSignal.aborted).toBe(true);
  });

  it("non modifica il comportamento legacy delle scritture", async () => {
    await expect(withClientTimeout(Promise.resolve("ok"))).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });
});
