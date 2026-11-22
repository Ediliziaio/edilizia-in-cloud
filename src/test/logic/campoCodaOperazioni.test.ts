import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncPermanentError, SyncTransientError, syncQueue } from "@/lib/campo/sync-queue";

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

it("mostra la ricevuta privata senza conservare gli allegati nella cronologia", async () => {
  syncQueue.registerProcessor(async () => {});
  const id = await syncQueue.enqueue({ type: "documento_ddt", payload: {
    user_id: "u-ricevute", company_id: "c-ricevute", order_id: "cantiere", fileNames: ["fronte.jpg"],
    files: [new Uint8Array([10, 11]).buffer],
  } });
  await syncQueue.processQueue();
  expect(await syncQueue.getAll()).toEqual([]);
  expect(await syncQueue.getRicevute("c-ricevute", "u-ricevute")).toEqual([{
    id, tipo: "documento_ddt", nome: "fronte.jpg", companyId: "c-ricevute", userId: "u-ricevute",
    orderId: "cantiere", data: 10000, giorno: undefined,
  }]);
  expect(await syncQueue.getRicevute("altra-azienda", "u-ricevute")).toEqual([]);
  expect(await syncQueue.getRicevute("c-ricevute", "altra-persona")).toEqual([]);
});

it("accetta una sola correzione concorrente e conserva la chiave dell’invio fallito", async () => {
  const payload = { user_id: "u-correggi", company_id: "c-correggi", descrizione: "Originale" };
  syncQueue.registerProcessor(async () => { throw new SyncPermanentError("Correggi i dati"); });
  await syncQueue.enqueue({ type: "rapportino", operationId: "stesso-rapporto", payload });
  await syncQueue.processQueue();
  const [voce] = await syncQueue.getAll("rapportino");
  expect(await syncQueue.riaccodaFallito(voce, { ...payload, user_id: "altra-persona" })).toBe(false);
  const esiti = await Promise.all([
    syncQueue.riaccodaFallito(voce, { ...payload, descrizione: "Corretto" }),
    syncQueue.riaccodaFallito(voce, { ...payload, descrizione: "Altra modifica" }),
  ]);
  expect(esiti).toEqual([true, false]);
  expect(await syncQueue.getAll("rapportino")).toMatchObject([
    { status: "pending", operationId: "stesso-rapporto", payload: { descrizione: "Corretto" } },
  ]);
});

it("aggiorna la coda della versione precedente senza perdere le foto o la chiave dell’invio", async () => {
  const database = new IDBFactory();
  await new Promise<void>((resolve, reject) => {
    const richiesta = database.open("campo-sync-queue", 1);
    richiesta.onupgradeneeded = () => {
      const items = richiesta.result.createObjectStore("items", { keyPath: "id" });
      items.createIndex("status", "status");
      items.createIndex("type", "type");
      items.createIndex("createdAt", "createdAt");
      items.add({
        id: "invio-precedente", operationId: "stessa-bolla", type: "documento_ddt",
        status: "pending", createdAt: ora, updatedAt: ora, retryCount: 0,
        payload: { user_id: "operaio", company_id: "azienda", order_id: "cantiere-precedente", fileNames: ["bolla.jpg"],
          files: [new Uint8Array([10, 20]).buffer] },
      });
    };
    richiesta.onsuccess = () => { richiesta.result.close(); resolve(); };
    richiesta.onerror = () => reject(richiesta.error);
  });

  vi.stubGlobal("indexedDB", database);
  vi.resetModules();
  const { syncQueue: codaAggiornata } = await import("@/lib/campo/sync-queue");
  const invia = vi.fn().mockResolvedValue(undefined);
  codaAggiornata.registerProcessor(invia);
  await codaAggiornata.processQueue();

  expect(invia).toHaveBeenCalledOnce();
  expect(invia).toHaveBeenCalledWith(expect.objectContaining({ operationId: "stessa-bolla",
    payload: expect.objectContaining({ order_id: "cantiere-precedente", files: [new Uint8Array([10, 20]).buffer] }) }));
  expect(await codaAggiornata.getAll()).toEqual([]);
  expect(await codaAggiornata.getRicevute("azienda", "operaio")).toMatchObject([
    { id: "stessa-bolla", nome: "bolla.jpg", orderId: "cantiere-precedente" },
  ]);
});
