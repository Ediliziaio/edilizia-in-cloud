import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { Blob as NodeBlob } from "node:buffer";
import { createStore, set, get, type UseStore } from "idb-keyval";
import { createLocalQuoteMemory, localDraftKey, readLocalQuoteSnapshot, LocalDraftConflict } from "@/lib/preventivi/localQuoteMemory";
import { patchChatLine } from "@/lib/preventivi/quoteChatDocument";
import { localSnapshot, memoryScope } from "./localPlanFixtures";
let store: UseStore;
beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("Blob", NodeBlob); store = createStore(`memory-${crypto.randomUUID()}`, "drafts"); });
afterEach(() => vi.unstubAllGlobals());
describe("Memoria IndexedDB locale, isolamento e atomicità", () => {
  it('riprende dossier e metadati senza fingere di avere l’originale su un altro dispositivo', async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.plan!.localFileMissing = true;
    snapshot.dossier = [{ id: snapshot.plan!.id, name: 'Planimetria', page: 1, kind: 'plan', origin: 'ocr', text: 'Bagno', excerpt: false }];
    await repo.save(memoryScope, snapshot, 0);
    const loaded = await repo.load(memoryScope); expect(loaded.blob).toBeNull(); expect(loaded.snapshot?.dossier).toEqual(snapshot.dossier);
    delete snapshot.plan!.localFileMissing;
    await expect(repo.save(memoryScope, snapshot, 1)).rejects.toThrow('Allegato');
    await repo.save(memoryScope, snapshot, 1, new Blob(['abc'])); expect((await repo.load(memoryScope)).blob?.size).toBe(3);
  });
  it('ripristina decisioni per componente senza perdere i vecchi formati', async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null;
    snapshot.componentDecisions = [{ room: '*', component: 'scaldasalviette', state: 'excluded', evidence: 'Scaldasalviette escluso' }];
    await repo.save(memoryScope, snapshot, 0);
    expect((await repo.load(memoryScope)).snapshot?.componentDecisions).toEqual(snapshot.componentDecisions);
    expect(readLocalQuoteSnapshot(localSnapshot()).componentDecisions).toBeUndefined();
    expect(() => readLocalQuoteSnapshot({ ...snapshot, componentDecisions: [{ ...snapshot.componentDecisions[0], component: 'inventato' }] })).toThrow();
  });
  it('recupera il computo Bagni solo nel modello locale corretto', async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null;
    snapshot.bagniDraft = { modelId: 'completo', clientName: 'Cliente sintetico', iva: 10, rows: [{ id: snapshot.document.lines[0].id, chapter: 'Finiture', discount: 5 }] };
    const scope = { ...memoryScope, flow: 'bagni:completo' as const };
    await repo.save(scope, snapshot, 0);
    expect((await repo.load(scope)).snapshot?.bagniDraft).toEqual(snapshot.bagniDraft);
    expect((await repo.load({ ...memoryScope, flow: 'bagni:rinnovo' })).snapshot).toBeNull();
    await expect(repo.save({ ...memoryScope, flow: 'classico' }, snapshot, 0)).rejects.toThrow('Modello Bagni');
    await expect(repo.save({ ...memoryScope, flow: 'bagni:rinnovo' }, snapshot, 0)).rejects.toThrow('Modello Bagni');
  });
  it("recupera chat, messaggio non inviato, allegato, OCR, misure e modifiche manuali", async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); const id = snapshot.document.lines[0].id;
    snapshot.document = patchChatLine(snapshot.document, id, { title: "Titolo mio", description: "d".repeat(5000), price: 15, included: true });
    expect(await repo.save(memoryScope, snapshot, 0, new Blob([new Uint8Array([255, 216, 255])]))).toBe(1);
    const loaded = await repo.load(memoryScope);
    expect(loaded.snapshot).toEqual(snapshot); expect(loaded.blob?.size).toBe(3);
    snapshot.input = "Secondo messaggio"; await repo.save(memoryScope, snapshot, 1);
    expect((await repo.load(memoryScope)).counter).toBe(2); expect((await repo.load(memoryScope)).blob?.size).toBe(3);
  });
  it("separa account e modalità e rifiuta aziende diverse da Demo 2", async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null;
    await repo.save(memoryScope, snapshot, 0);
    expect((await repo.load({ ...memoryScope, ownerId: "b2000000-0000-4000-a000-000000000001" })).snapshot).toBeNull();
    expect((await repo.load({ ...memoryScope, mode: "real" })).snapshot).toBeNull();
    expect(() => localDraftKey({ ...memoryScope, companyId: "other" })).toThrow(/Demo/);
    expect(() => localDraftKey({ ...memoryScope, ownerId: "anonymous" })).toThrow(/Identità/);
  });
  it("due schede contemporanee: salva una sola revisione senza sovrascrivere", async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null;
    const results = await Promise.allSettled([repo.save(memoryScope, snapshot, 0), repo.save(memoryScope, { ...snapshot, input: "Altra scheda" }, 0)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: expect.any(LocalDraftConflict) });
    expect((await repo.load(memoryScope)).counter).toBe(1);
  });
  it("le simulazioni bagno, serramenti e parziale non sovrascrivono il progetto principale", async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot(); snapshot.plan = null; snapshot.rectangle = null;
    snapshot.document.title = "Progetto principale"; await repo.save(memoryScope, snapshot, 0);
    for (const scenarioId of ["bagno", "serramenti", "parziale"] as const) {
      const scope = { ...memoryScope, scenarioId }; expect((await repo.load(scope)).snapshot).toBeNull();
      await repo.save(scope, { ...snapshot, document: { ...snapshot.document, title: `Prova ${scenarioId}` } }, 0);
      expect((await repo.load(scope)).snapshot?.document.title).toBe(`Prova ${scenarioId}`);
    }
    expect((await repo.load(memoryScope)).snapshot?.document.title).toBe("Progetto principale");
    expect(() => localDraftKey({ ...memoryScope, scenarioId: "../main" as "bagno" })).toThrow("non valida");
  });
  it("bozza corrotta o versione futura: non si recupera né si sostituisce con una vuota", async () => {
    await set(localDraftKey(memoryScope), { version: 20, counter: 5 }, store);
    const repo = createLocalQuoteMemory(store); await expect(repo.load(memoryScope)).rejects.toThrow(/Versione/);
    await expect(repo.save(memoryScope, localSnapshot(), 0)).rejects.toBeInstanceOf(LocalDraftConflict);
    expect(await get(localDraftKey(memoryScope), store)).toEqual({ version: 20, counter: 5 });
  });
  it("allegato mancante o incoerente: fallisce l’intera transazione", async () => {
    const repo = createLocalQuoteMemory(store);
    await expect(repo.save(memoryScope, localSnapshot(), 0)).rejects.toThrow(/Allegato/);
    await expect(repo.save(memoryScope, localSnapshot(), 0, new Blob(["bad-size"]))).rejects.toThrow(/Allegato/);
    expect((await repo.load(memoryScope)).counter).toBe(0);
    await repo.save(memoryScope, localSnapshot(), 0, new Blob(["abc"]));
    await set(`${localDraftKey(memoryScope)}:asset`, { id: "b".repeat(64), blob: new Blob(["abc"]) }, store);
    await expect(repo.load(memoryScope)).rejects.toThrow(/Allegato/);
  });
  it("nuovo progetto elimina solo l’allegato dello scope corrente", async () => {
    const repo = createLocalQuoteMemory(store); const snapshot = localSnapshot();
    await repo.save(memoryScope, snapshot, 0, new Blob(["abc"]));
    const other = { ...memoryScope, mode: "real" as const }; await repo.save(other, snapshot, 0, new Blob(["abc"]));
    snapshot.plan = null; snapshot.rectangle = null; snapshot.rooms = []; snapshot.selectedRoom = null;
    await repo.save(memoryScope, snapshot, 1);
    expect((await repo.load(memoryScope)).blob).toBeNull(); expect((await repo.load(other)).blob?.size).toBe(3);
  });
  it.each(["version", "revision", "quantity", "selected", "duplicate", "tooMany", "hugeText"])("rifiuta snapshot malformato: %s", kind => {
    const s = localSnapshot();
    if (kind === "version") s.version = 2 as 1;
    if (kind === "revision") s.document.revision = NaN;
    if (kind === "quantity") s.document.lines[0].quantity = Infinity;
    if (kind === "selected") s.selectedRoom = "unknown";
    if (kind === "duplicate") s.document.lines.push(s.document.lines[0]);
    if (kind === "tooMany") s.messages = Array.from({ length: 51 }, () => ({ role: "user", text: "x" }));
    if (kind === "hugeText") s.input = "x".repeat(3001);
    expect(() => readLocalQuoteSnapshot(s)).toThrow();
  });
  it("ricalcola area dalla conferma, non si fida di un totale salvato alterato", () => {
    const s = localSnapshot(); s.rectangle!.area = 9999;
    expect(readLocalQuoteSnapshot(s).rectangle?.area).toBe(19.59);
  });
  it("un errore di spazio non appare come salvataggio riuscito", async () => {
    const denied: UseStore = () => Promise.reject(new DOMException("quota", "QuotaExceededError"));
    await expect(createLocalQuoteMemory(denied).save(memoryScope, localSnapshot(), 0, new Blob(["abc"]))).rejects.toThrow(/quota/);
  });
});
