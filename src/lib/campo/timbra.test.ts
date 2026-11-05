import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  rpc: vi.fn(),
  enqueue: vi.fn(async () => "coda"),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.insert }), rpc: mocks.rpc },
}));
vi.mock("./sync-queue", () => ({ syncQueue: { enqueue: mocks.enqueue } }));

import { cambiaLuogoTimbratura, erroreDiRete, scriviTimbratura } from "./timbra";

const base = { companyId: "c", userId: "u", tipo: "entrata" as const, orderId: "o", quando: "2026-11-02T08:00:00.000Z" };
const online = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });

beforeEach(() => { vi.clearAllMocks(); online(true); mocks.insert.mockResolvedValue({ error: null }); mocks.rpc.mockResolvedValue({ error: null }); });
afterEach(() => online(true));

describe("timbrare senza campo", () => {
  it("con la rete scrive subito", async () => {
    expect(await scriviTimbratura(base)).toEqual({ inCoda: false });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("senza rete mette in coda con l'ora vera, senza provare", async () => {
    online(false);
    expect(await scriviTimbratura(base)).toEqual({ inCoda: true });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: "timbratura",
      payload: expect.objectContaining({ timestamp_evento: base.quando, user_id: "u", company_id: "c", tipo: "entrata" }),
    }));
  });
  it("con una tacca che cade rimanda lo stesso id, così non fa doppioni", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "TypeError: Failed to fetch" } });
    expect(await scriviTimbratura(base)).toEqual({ inCoda: true });
    const inviata = mocks.insert.mock.calls[0][0];
    const inCoda = (mocks.enqueue.mock.calls[0] as unknown as [{ payload: { id: string } }])[0].payload;
    expect(inCoda.id).toBe(inviata.id);
  });
  it("un rifiuto del database non va in coda: lo deve sapere subito", async () => {
    const rifiuto = { code: "42501", message: "permesso negato" };
    mocks.insert.mockResolvedValue({ error: rifiuto });
    await expect(scriviTimbratura(base)).rejects.toBe(rifiuto);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("il cambio di posto senza rete diventa uscita ed entrata, nell'ordine", async () => {
    online(false);
    await cambiaLuogoTimbratura({ companyId: "c", userId: "u", da: { orderId: "a", sedeId: null }, a: { orderId: "b", sedeId: null }, quando: base.quando });
    const righe = mocks.enqueue.mock.calls.map(c => (c as unknown as [{ payload: { tipo: string; order_id: string; timestamp_evento: string } }])[0].payload);
    expect(righe.map(r => [r.tipo, r.order_id])).toEqual([["uscita", "a"], ["entrata", "b"]]);
    expect(righe[0].timestamp_evento < righe[1].timestamp_evento).toBe(true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("riconosce l'errore di rete dai messaggi dei browser", () => {
    expect(erroreDiRete({ message: "Load failed" })).toBe(true);
    expect(erroreDiRete({ message: "Failed to fetch" })).toBe(true);
    expect(erroreDiRete({ code: "23505", message: "network" })).toBe(false);
    expect(erroreDiRete(null)).toBe(false);
  });
});
