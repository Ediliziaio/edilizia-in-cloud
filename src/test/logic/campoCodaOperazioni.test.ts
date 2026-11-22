import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncTransientError, syncQueue } from "@/lib/campo/sync-queue";

let ora = 10000;
let rete = true;

beforeEach(async () => {
  for (const voce of await syncQueue.getAll()) await syncQueue.remove(voce.id);
  ora = 10000;
  rete = true;
  vi.spyOn(Date, "now").mockImplementation(() => ora);
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("conserva le foto del rapportino e un solo invio per bozza confermata", async () => {
  const invia = vi.fn().mockResolvedValue(undefined);
  syncQueue.registerProcessor(invia);
  vi.stubGlobal("navigator", { onLine: false });
  const bytes = [10, 20, 30];
  const [primoId, secondoId] = await Promise.all([
    syncQueue.enqueue({ type: "rapportino", dedupKey: "azienda:operatore:commessa:giorno", operationId: "primo",
      payload: { foto: new Uint8Array(bytes).buffer } }),
    syncQueue.enqueue({ type: "rapportino", dedupKey: "azienda:operatore:commessa:giorno", operationId: "secondo",
      payload: { foto: new Uint8Array([9]).buffer } }),
  ]);
  expect(primoId).toEqual(secondoId);
  await syncQueue.processQueue();
  expect(invia).not.toHaveBeenCalled();
  const [salvato] = await syncQueue.getAll("rapportino");
  expect(salvato.operationId).toBe("primo");
  const { foto } = salvato.payload as { foto: ArrayBuffer };
  expect([...new Uint8Array(foto)]).toEqual(bytes);
  vi.stubGlobal("navigator", { onLine: true });
  await Promise.all([syncQueue.processQueue(), syncQueue.processQueue()]);
  expect(invia).toHaveBeenCalledOnce();
  expect(await syncQueue.getAll("rapportino")).toEqual([]);
});

it("un prelievo interrotto riparte con la stessa chiave anche dopo molti errori di rete", async () => {
  const tentativi: string[] = [];
  syncQueue.registerProcessor(async voce => {
    tentativi.push(voce.operationId!);
    if (!rete) throw new SyncTransientError("Failed to fetch");
  });
  rete = false;
  await syncQueue.enqueue({
    type: "prelievo", dedupKey: "azienda:operaio:conferma", operationId: "stesso-prelievo",
    payload: { quantita: 2.25 },
  });
  for (let i = 0; i < 7; i++) {
    await syncQueue.processQueue();
    ora += 30_000;
  }
  expect(await syncQueue.getAll("prelievo")).toMatchObject([{ status: "pending", retryCount: 4 }]);
  rete = true;
  await syncQueue.processQueue();
  expect(tentativi).toHaveLength(8);
  expect(new Set(tentativi)).toEqual(new Set(["stesso-prelievo"]));
  expect(await syncQueue.getAll("prelievo")).toEqual([]);
});
