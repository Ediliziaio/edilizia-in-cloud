import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { chiamaMotoreOnline, ErroreMotore } from "@/lib/planimetrie/motoreOnline";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";

describe("client del motore planimetrie online", () => {
  const fetchFinto = vi.fn();
  beforeEach(() => { vi.stubGlobal("fetch", fetchFinto); vi.useFakeTimers(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); invoke.mockReset(); fetchFinto.mockReset(); });

  it("chiede il biglietto per l'azienda e lo manda al motore", async () => {
    invoke.mockResolvedValue({ data: { biglietto: "b1", url: "https://motore.example" }, error: null });
    fetchFinto.mockResolvedValue(new Response("png", { status: 200, headers: { "content-type": "image/png" } }));
    const r = await chiamaMotoreOnline(AZIENDA, "render", "/render", { body: "glb", headers: { "Content-Type": "model/gltf-binary" }, signal: new AbortController().signal });
    expect(r.status).toBe(200);
    expect(invoke).toHaveBeenCalledWith("planimetria-motore", { body: { azione: "biglietto", company_id: AZIENDA, operazione: "render" } });
    expect(fetchFinto).toHaveBeenCalledWith("https://motore.example/render", expect.objectContaining({
      headers: { "Content-Type": "model/gltf-binary", Authorization: "Bearer b1" }, credentials: "omit",
    }));
  });

  it("motore occupato: biglietto nuovo e nuovo tentativo", async () => {
    invoke.mockResolvedValueOnce({ data: { biglietto: "b1", url: "https://motore.example" }, error: null })
      .mockResolvedValueOnce({ data: { biglietto: "b2", url: "https://motore.example" }, error: null });
    fetchFinto.mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const promessa = chiamaMotoreOnline(AZIENDA, "dwg", "/dwg", { body: "dwg", headers: {}, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await promessa).status).toBe(200);
    expect(fetchFinto.mock.calls[1][1].headers.Authorization).toBe("Bearer b2");
  });

  it("crediti finiti: porta all'utente il messaggio della funzione", async () => {
    const context = new Response(JSON.stringify({ error: "Crediti render esauriti: ricaricali per il render fotorealistico." }), { status: 402 });
    invoke.mockResolvedValue({ data: null, error: { context } });
    await expect(chiamaMotoreOnline(AZIENDA, "render", "/render", { body: "glb", headers: {}, signal: new AbortController().signal }))
      .rejects.toThrow(/Crediti render esauriti/);
    expect(fetchFinto).not.toHaveBeenCalled();
  });

  it("senza azienda non chiede niente", async () => {
    await expect(chiamaMotoreOnline(null, "render", "/render", { body: "x", headers: {}, signal: new AbortController().signal })).rejects.toBeInstanceOf(ErroreMotore);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rifiuta un indirizzo del motore non https", async () => {
    invoke.mockResolvedValue({ data: { biglietto: "b1", url: "http://motore.example" }, error: null });
    await expect(chiamaMotoreOnline(AZIENDA, "render", "/render", { body: "x", headers: {}, signal: new AbortController().signal })).rejects.toThrow(/non valida/);
  });
});
