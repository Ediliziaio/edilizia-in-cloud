import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncPermanentError, SyncTransientError, syncQueue } from "@/lib/campo/sync-queue";
import type { BozzaAvanzamento, BozzaVisita } from "@/lib/campo/bozzaTecnica";

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

it("conserva la bozza tecnica con foto, rispetta l’ambito e promuove una sola conferma concorrente", async () => {
  const foto = { bytes: new Uint8Array([10, 20, 30]).buffer,
    contentType: "image/jpeg", nomeFile: "foto.jpg" };
  const dati: BozzaVisita = { tipo: "rilievo", visita: "rilievo", company_id: "impresa-tecnica", user_id: "geometra",
    order_id: "scuola", nomeCantiere: "Scuola", giorno: "2026-11-22", misure: "70 cm", note: "Vano", foto: [foto] };
  const bozza = await syncQueue.salvaBozzaTecnica(dati);
  await expect(syncQueue.salvaBozzaTecnica(dati)).rejects.toThrow("Questa bozza è cambiata");
  const [letta] = await syncQueue.getBozzeTecniche(dati.company_id, dati.user_id);
  expect(letta.operationId).toBe(bozza.operationId);
  expect(new Uint8Array(letta.payload.foto[0].bytes)).toEqual(new Uint8Array([10, 20, 30]));
  expect(await syncQueue.getBozzeTecniche(dati.company_id, "altra-persona")).toEqual([]);
  expect(await syncQueue.getBozzeTecniche("altra-azienda", dati.user_id)).toEqual([]);
  const tentativi = await Promise.allSettled([syncQueue.accodaBozzaTecnica(bozza), syncQueue.accodaBozzaTecnica(letta)]);
  expect(tentativi.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await syncQueue.getBozzaTecnica(dati)).toBeUndefined();
  expect(await syncQueue.getAll("rilievo")).toMatchObject([{ operationId: bozza.operationId }]);
  syncQueue.registerProcessor(async () => {});
  await syncQueue.processQueue();
  expect(await syncQueue.getRicevute(dati.company_id, dati.user_id)).toMatchObject([{ id: bozza.operationId, nome: "Rilievo" }]);
  expect(await syncQueue.getAll("rilievo")).toEqual([]);
});

it("un avanzamento superato torna in bozza solo dopo la rilettura, con la stessa identità", async () => {
  const dati: BozzaAvanzamento = { tipo: "avanzamento", company_id: "azienda-conf", user_id: "capo",
    order_id: "cantiere", nomeCantiere: "Cantiere", target: { faseId: "posa", nome: "Posa", percentuale: 30, completata: false },
    valore: "70", note: "Nota da conservare", foto: [], chiusuraRichiesta: false };
  const prima = await syncQueue.salvaBozzaTecnica(dati);
  await syncQueue.accodaBozzaTecnica(prima);
  syncQueue.registerProcessor(async () => { throw new SyncPermanentError("Valore cambiato", "avanzamento-cambiato"); });
  await syncQueue.processQueue();
  await syncQueue.retryFailed();
  const [fallita] = await syncQueue.getAll("avanzamento");
  expect(fallita.status).toBe("failed");
  expect(await syncQueue.recuperaAvanzamento(fallita as typeof fallita & { payload: BozzaAvanzamento })).toBe(true);
  const ripresa = await syncQueue.getBozzaTecnica(dati);
  expect(ripresa).toMatchObject({ operationId: prima.operationId, payload: { note: dati.note, valore: "70" } });
  const aggiornata = await syncQueue.salvaBozzaTecnica({ ...dati, target: { ...dati.target, percentuale: 45 } }, ripresa);
  await syncQueue.accodaBozzaTecnica(aggiornata);
  expect(await syncQueue.getAll("avanzamento")).toMatchObject([{ status: "pending", operationId: prima.operationId }]);
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
