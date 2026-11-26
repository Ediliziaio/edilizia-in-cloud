/**
 * Coda di sincronizzazione offline-first.
 * Memorizza operazioni POST/PATCH in IndexedDB e le processa con retry esponenziale
 * quando torna la connessione o periodicamente.
 *
 * Usage:
 *   await syncQueue.enqueue({ type: "checklist", payload: {...} });
 *   syncQueue.on("change", () => updateBadge());
 *   await syncQueue.processQueue();
 */
import { isOnline } from "./network-status";
import { idBozzaTecnica, nomeBozzaTecnica, type BozzaTecnica, type DatiBozzaTecnica } from "./bozzaTecnica";

export type SyncItemType =
  | "documento_ddt"
  | "checklist"
  | "rapportino_vocale"
  | "rapportino"
  | "prelievo"
  | "avanzamento"
  | "rilievo"
  | "timbratura"
  | "foto"
  | "spesa"
  | "segnalazione"
  | "generic";

export type SyncStatus = "pending" | "syncing" | "failed" | "done";

export interface SyncItem<TPayload = unknown> {
  id: string;
  type: SyncItemType;
  payload: TPayload;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  status: SyncStatus;
  lastError?: string;
  errorCode?: string;
  /** Path del bucket (per upload file) oppure endpoint tabella */
  target?: string;
  /** Identità stabile anche per gli elementi delle vecchie versioni. */
  operationId?: string;
}

const DB_NAME = "campo-sync-queue";
const DB_VERSION = 3;
const STORE_NAME = "items";
const RICEVUTE = "ricevute";
const BOZZE_TECNICHE = "bozze-tecniche";
const MAX_RICEVUTE = 40;
const MAX_RETRY = 5;
const BACKOFF_BASE_MS = 1000;
const SYNC_LEASE_MS = 5 * 60_000;

export class SyncPermanentError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}
export class SyncDeferredError extends Error {}
export class SyncTransientError extends Error {}

export function isInvioTecnico(tipo: SyncItemType): tipo is DatiBozzaTecnica["tipo"] {
  return tipo === "avanzamento" || tipo === "rilievo";
}
export function syncItemScope(item: SyncItem) {
  const p = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : {};
  const row = (item.type === "foto" ? p.riga : p) as Record<string, unknown> | undefined;
  const legacyAudio = item.type === "foto" && p.bucket === "campo-audio" && typeof p.path === "string";
  const owner = row?.user_id ?? row?.operaio_id ?? row?.uploaded_by ?? (legacyAudio ? (p.path as string).split("/")[0] : undefined);
  return { owner, companyId: row?.company_id, legacyAudio };
}

export type TipoInvioCampo = Extract<SyncItemType, "prelievo" | "rapportino" | "documento_ddt" | "avanzamento" | "rilievo">;
export interface RicevutaCampo {
  id: string;
  tipo: TipoInvioCampo;
  companyId: string;
  userId: string;
  orderId: string | null;
  giorno?: string;
  nome?: string;
  cantiere?: string;
  data: number;
}

function ricevutaCampo(item: SyncItem, result?: CampoSyncResult): RicevutaCampo | undefined {
  if (result?.errore || (item.type !== "prelievo" && item.type !== "rapportino" && item.type !== "documento_ddt"
    && !isInvioTecnico(item.type))) return;
  const { owner, companyId } = syncItemScope(item);
  const dati = item.payload as { order_id?: unknown; giorno?: unknown; fileNames?: unknown; source?: unknown };
  if (typeof owner !== "string" || typeof companyId !== "string" || dati.source === "desktop") return;
  const tecnica = isInvioTecnico(item.type) ? item.payload as DatiBozzaTecnica : undefined;
  const nome = tecnica ? nomeBozzaTecnica(tecnica) : Array.isArray(dati.fileNames) ? dati.fileNames[0] : undefined;
  return { id: item.operationId ?? item.id, tipo: item.type, companyId, userId: owner,
    orderId: typeof dati.order_id === "string" ? dati.order_id : null,
    giorno: typeof dati.giorno === "string" ? dati.giorno : undefined,
    nome: typeof nome === "string" ? nome : undefined, ...(tecnica ? { cantiere: tecnica.nomeCantiere } : {}), data: Date.now() };
}
export function canProcessSyncItem(item: SyncItem, now = Date.now(), lockEsclusivo = false): boolean {
  if (item.status === "done" || item.retryCount >= MAX_RETRY) return false;
  if (item.status === "syncing") return lockEsclusivo || now - item.updatedAt >= SYNC_LEASE_MS;
  return item.retryCount === 0 || now - item.updatedAt >= BACKOFF_BASE_MS * 2 ** (item.retryCount - 1);
}

export async function syncOperationId(item: SyncItem): Promise<string> {
  if (item.operationId) return item.operationId;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) return item.id;
  // Anche due tab che recuperano una vecchia operazione scelgono la stessa chiave.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("campo-sync:" + item.id));
  const h = Array.from(new Uint8Array(digest)).slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
}

export type CampoSyncResult = {
  tipo: "prelievo" | "rapportino" | "avanzamento" | "rilievo";
  companyId: string;
  userId: string;
  orderId: string;
  id?: string;
  stato?: string;
  errore?: string;
  pdf?: boolean;
  avvisoMezzi?: boolean;
  chiudeGiornata?: boolean;
};
type QueueEvent = "change" | "draft-change" | "enqueued" | "processed" | "failed";
type Listener = (result?: CampoSyncResult) => void;

let dbPromise: Promise<IDBDatabase> | null = null;
const listeners: Record<QueueEvent, Set<Listener>> = {
  change: new Set(),
  "draft-change": new Set(),
  enqueued: new Set(),
  processed: new Set(),
  failed: new Set(),
};

let channel: BroadcastChannel | null | undefined;

function notify(event: QueueEvent, result?: CampoSyncResult): void {
  listeners[event].forEach((l) => {
    try {
      l(result);
    } catch (e) {
      console.error("[sync-queue] listener error", e);
    }
  });
}

function openChannel() {
  if (channel !== undefined) return channel;
  channel = typeof window !== "undefined" && typeof window.BroadcastChannel !== "undefined"
    ? new window.BroadcastChannel(DB_NAME) : null;
  channel?.addEventListener("message", ({ data }) => {
    if (data?.event === "change" || data?.event === "draft-change" || data?.event === "enqueued") notify(data.event);
  });
  return channel;
}

function emit(event: QueueEvent, result?: CampoSyncResult): void {
  notify(event, result);
  if (event === "change" || event === "draft-change" || event === "enqueued") openChannel()?.postMessage({ event });
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Riapri l’app per aggiornare la coda del telefono"));
    req.onsuccess = () => {
      const db = req.result;
      if (dbPromise !== opening) {
        db.close();
        return;
      }
      const riapri = () => { if (dbPromise === opening) dbPromise = null; };
      db.onclose = riapri;
      db.onversionchange = () => { db.close(); riapri(); };
      resolve(db);
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(RICEVUTE)) {
        const ricevute = db.createObjectStore(RICEVUTE, { keyPath: "id" });
        ricevute.createIndex("ambito", ["companyId", "userId"]);
      }
      if (!db.objectStoreNames.contains(BOZZE_TECNICHE)) {
        const bozze = db.createObjectStore(BOZZE_TECNICHE, { keyPath: "id" });
        bozze.createIndex("ambito", ["payload.company_id", "payload.user_id"]);
      }
    };
  });
  // Un'apertura fallita non deve avvelenare ogni successivo tentativo.
  const opening = dbPromise;
  void opening.catch(() => { if (dbPromise === opening) dbPromise = null; });
  return opening;
}

function generateId(): string {
  return crypto.randomUUID();
}

type VoceDaAccodare<T> = Pick<SyncItem<T>, "type" | "payload" | "target" | "operationId"> & { dedupKey?: string };

async function enqueueBatch<T>(items: ReadonlyArray<VoceDaAccodare<T>>): Promise<string[]> {
  if (!items.length) return [];
  const db = await openDB();
  const now = Date.now();
  const fullItems = items.map(({ dedupKey, ...item }, indice): SyncItem<T> => {
    const id = dedupKey ? `coda:${item.type}:${dedupKey}` : generateId();
    return {
      ...item, id, operationId: item.operationId ?? (dedupKey ? generateId() : id),
      createdAt: now + indice, updatedAt: now, retryCount: 0, status: "pending",
    };
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Salvataggio sul telefono interrotto"));
    const store = tx.objectStore(STORE_NAME);
    try {
      for (const [indice, item] of fullItems.entries()) {
        if (!items[indice].dedupKey) store.add(item);
        else {
          const esistente = store.get(item.id);
          esistente.onsuccess = () => {
            if (!esistente.result) store.add(item);
          };
        }
      }
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
  emit("change");
  emit("enqueued");
  return fullItems.map(item => item.id);
}

async function enqueue<T>(item: VoceDaAccodare<T>): Promise<string> {
  const [id] = await enqueueBatch([item]);
  return id;
}

async function getAll(tipo?: SyncItemType): Promise<SyncItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = tipo ? store.index("type").getAll(tipo) : store.getAll();
    req.onsuccess = () => resolve(req.result as SyncItem[]);
    req.onerror = () => reject(req.error);
  });
}

async function getPending(): Promise<SyncItem[]> {
  const all = await getAll();
  return all.filter(i => canProcessSyncItem(i));
}

async function getQueueCount(): Promise<number> {
  const all = await getAll();
  return all.filter((i) => i.status !== "done").length;
}

async function getRicevute(companyId: string, userId: string): Promise<RicevutaCampo[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(RICEVUTE).objectStore(RICEVUTE).index("ambito").getAll([companyId, userId]);
    req.onsuccess = () => resolve((req.result as RicevutaCampo[]).sort((a, b) => b.data - a.data));
    req.onerror = () => reject(req.error);
  });
}

async function getBozzeTecniche(companyId: string, userId: string): Promise<BozzaTecnica[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BOZZE_TECNICHE).objectStore(BOZZE_TECNICHE).index("ambito").getAll([companyId, userId]);
    req.onsuccess = () => resolve((req.result as BozzaTecnica[]).sort((a, b) => b.aggiornataIl - a.aggiornataIl));
    req.onerror = () => reject(req.error);
  });
}

async function countBozzeTecniche(companyId: string, userId: string): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BOZZE_TECNICHE).objectStore(BOZZE_TECNICHE).index("ambito").count([companyId, userId]);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getBozzaTecnica<T extends DatiBozzaTecnica>(dati: T): Promise<BozzaTecnica<T> | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(BOZZE_TECNICHE).objectStore(BOZZE_TECNICHE).get(idBozzaTecnica(dati));
    req.onsuccess = () => resolve(req.result as BozzaTecnica<T> | undefined);
    req.onerror = () => reject(req.error);
  });
}

const erroreBozza = () => new Error("Questa bozza è cambiata in un’altra scheda. Ricaricala per vedere l’ultima versione.");

async function salvaBozzaTecnica<T extends DatiBozzaTecnica>(dati: T, precedente?: BozzaTecnica<T>): Promise<BozzaTecnica<T>> {
  const db = await openDB();
  const bozza = {
    id: idBozzaTecnica(dati), operationId: precedente?.operationId ?? generateId(),
    versione: (precedente?.versione ?? 0) + 1, aggiornataIl: Date.now(), payload: dati,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BOZZE_TECNICHE, "readwrite");
    const store = tx.objectStore(BOZZE_TECNICHE);
    const req = store.get(bozza.id);
    let conflitto = false;
    req.onsuccess = () => {
      const attuale = req.result as BozzaTecnica | undefined;
      conflitto = attuale?.operationId !== precedente?.operationId || attuale?.versione !== precedente?.versione;
      if (!conflitto) store.put(bozza);
    };
    tx.oncomplete = () => conflitto ? reject(erroreBozza()) : resolve();
    tx.onabort = () => reject(tx.error);
  });
  emit("draft-change");
  return bozza;
}

async function accodaBozzaTecnica(bozza: BozzaTecnica): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOZZE_TECNICHE, STORE_NAME], "readwrite");
    const bozze = tx.objectStore(BOZZE_TECNICHE);
    const req = bozze.get(bozza.id);
    let conflitto = false;
    req.onsuccess = () => {
      const attuale = req.result as BozzaTecnica | undefined;
      conflitto = !attuale || attuale.operationId !== bozza.operationId || attuale.versione !== bozza.versione;
      if (conflitto || !attuale) return;
      const now = Date.now();
      const item: SyncItem<DatiBozzaTecnica> = {
        id: attuale.operationId, operationId: attuale.operationId, type: attuale.payload.tipo, payload: attuale.payload,
        status: "pending", createdAt: now, updatedAt: now, retryCount: 0,
      };
      tx.objectStore(STORE_NAME).add(item);
      bozze.delete(bozza.id);
    };
    tx.oncomplete = () => conflitto ? reject(erroreBozza()) : resolve();
    tx.onabort = () => reject(tx.error);
  });
  emit("change");
  emit("enqueued");
}

async function recuperaAvanzamento(voce: SyncItem<DatiBozzaTecnica>): Promise<boolean> {
  const db = await openDB();
  const riuscito = await new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction([BOZZE_TECNICHE, STORE_NAME], "readwrite");
    const coda = tx.objectStore(STORE_NAME);
    const bozze = tx.objectStore(BOZZE_TECNICHE);
    const req = coda.get(voce.id);
    let recuperato = false;
    req.onsuccess = () => {
      const attuale = req.result as SyncItem<DatiBozzaTecnica> | undefined;
      if (attuale?.type !== "avanzamento" || attuale.status !== "failed" || attuale.errorCode !== "avanzamento-cambiato"
        || attuale.updatedAt !== voce.updatedAt || !attuale.operationId) return;
      const id = idBozzaTecnica(attuale.payload);
      const leggi = bozze.get(id);
      leggi.onsuccess = () => {
        if (leggi.result) return;
        bozze.add({ id, operationId: attuale.operationId!, versione: 1, aggiornataIl: Date.now(), payload: attuale.payload });
        coda.delete(attuale.id);
        recuperato = true;
      };
    };
    tx.oncomplete = () => resolve(recuperato);
    tx.onabort = () => reject(tx.error);
  });
  if (riuscito) emit("change");
  return riuscito;
}

async function riaccodaFallito<T>(voce: SyncItem<T>, payload = voce.payload): Promise<boolean> {
  const db = await openDB();
  const riaccodato = await new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const leggi = store.get(voce.id);
    let aggiornato = false;
    leggi.onsuccess = () => {
      const attuale = leggi.result as SyncItem<T> | undefined;
      if (!attuale || attuale.status !== "failed" || attuale.updatedAt !== voce.updatedAt
        || attuale.type !== voce.type || attuale.operationId !== voce.operationId) return;
      const prossima = { ...attuale, payload };
      const vecchioAmbito = syncItemScope(attuale);
      const nuovoAmbito = syncItemScope(prossima);
      if (vecchioAmbito.owner !== nuovoAmbito.owner || vecchioAmbito.companyId !== nuovoAmbito.companyId) return;
      store.put({ ...prossima, status: "pending", retryCount: 0, lastError: undefined, errorCode: undefined, updatedAt: Date.now() });
      aggiornato = true;
    };
    tx.oncomplete = () => resolve(aggiornato);
    tx.onabort = () => reject(tx.error);
  });
  if (riaccodato) emit("change");
  return riaccodato;
}

async function remove(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emit("change");
}

async function clearCompleted(): Promise<number> {
  const all = await getAll();
  const done = all.filter((i) => i.status === "done");
  for (const item of done) {
    await remove(item.id);
  }
  return done.length;
}

async function retryFailed(eligible: (item: SyncItem) => boolean = () => true): Promise<void> {
  for (const item of await getAll()) {
    if (item.status !== "failed" || item.errorCode === "avanzamento-cambiato" || !eligible(item)) continue;
    await riaccodaFallito(item);
  }
}

/**
 * Processore registrato dall'app — riceve un SyncItem e tenta l'upload verso Supabase.
 * Deve throware su errore per attivare il retry.
 */
export type SyncProcessor = (item: SyncItem) => Promise<void | CampoSyncResult>;

let processor: SyncProcessor | null = null;

function registerProcessor(fn: SyncProcessor): void {
  processor = fn;
}

let isProcessing = false;

async function claim(item: SyncItem, operationId: string, lockEsclusivo: boolean): Promise<SyncItem | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(item.id);
    let presa: SyncItem | undefined;
    req.onsuccess = () => {
      const attuale = req.result as SyncItem | undefined;
      if (!attuale || !canProcessSyncItem(attuale, Date.now(), lockEsclusivo)) return;
      presa = { ...attuale, status: "syncing", operationId: attuale.operationId ?? operationId, updatedAt: Date.now() };
      store.put(presa);
    };
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve(presa);
  });
}

async function terminaTentativo(item: SyncItem, inizio: number, result?: CampoSyncResult): Promise<boolean> {
  const db = await openDB();
  const ricevuta = item.status === "done" ? ricevutaCampo(item, result) : undefined;
  const aggiornata = await new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction(ricevuta ? [STORE_NAME, RICEVUTE] : STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(item.id);
    let applicata = false;
    req.onsuccess = () => {
      const attuale = req.result as SyncItem | undefined;
      if (!attuale || attuale.status !== "syncing" || attuale.updatedAt !== inizio) return;
      if (item.status === "done") {
        store.delete(item.id);
        if (ricevuta) {
          const ricevute = tx.objectStore(RICEVUTE);
          ricevute.put(ricevuta);
          const storico = ricevute.index("ambito").getAll([ricevuta.companyId, ricevuta.userId]);
          storico.onsuccess = () => {
            for (const vecchia of (storico.result as RicevutaCampo[]).sort((a, b) => b.data - a.data).slice(MAX_RICEVUTE)) {
              ricevute.delete(vecchia.id);
            }
          };
        }
      }
      else store.put({ ...item, updatedAt: Date.now() });
      applicata = true;
    };
    tx.oncomplete = () => resolve(applicata);
    tx.onabort = () => reject(tx.error);
  });
  if (aggiornata) emit("change");
  return aggiornata;
}

async function processQueueUnlocked(lockEsclusivo = false): Promise<void> {
  if (isProcessing) return;
  if (!processor) {
    console.warn("[sync-queue] nessun processor registrato");
    return;
  }
  if (!isOnline()) return;

  isProcessing = true;
  try {
    const items = (await getAll()).filter(i => canProcessSyncItem(i, Date.now(), lockEsclusivo))
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const candidate of items) {
      if (!isOnline()) break;
      const item = await claim(candidate, await syncOperationId(candidate), lockEsclusivo);
      if (!item) continue;
      emit("change");
      const inizio = item.updatedAt;
      try {
        const result = await processor!(item);
        item.status = "done";
        item.lastError = undefined;
        if (await terminaTentativo(item, inizio, result || undefined)) emit("processed", result || undefined);
      } catch (error) {
        if (error instanceof SyncDeferredError) {
          item.status = "pending";
          await terminaTentativo(item, inizio);
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        const inCampo = item.type === "prelievo" || item.type === "rapportino" || isInvioTecnico(item.type);
        const reteInterrotta = inCampo && !(
          error instanceof SyncPermanentError
        ) && (!isOnline() || /failed to fetch|load failed|network|timeout|timed out|tempo scaduto/i.test(message));
        item.retryCount = error instanceof SyncTransientError || reteInterrotta
          ? Math.min(item.retryCount + 1, MAX_RETRY - 1)
          : item.retryCount + 1;
        if (error instanceof SyncPermanentError) item.retryCount = MAX_RETRY;
        item.lastError = message;
        item.errorCode = error instanceof SyncPermanentError ? error.code : undefined;
        item.status = item.retryCount >= MAX_RETRY ? "failed" : "pending";
        if (await terminaTentativo(item, inizio)) emit("failed");
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function processQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    try {
      await navigator.locks.request("campo-sync-queue", { ifAvailable: true }, async lock => {
        if (lock) await processQueueUnlocked(true);
      });
    } catch (error) {
      if (!(error instanceof DOMException) || !["SecurityError", "NotSupportedError"].includes(error.name)) throw error;
      await processQueueUnlocked();
    }
  } else await processQueueUnlocked();
}

function on(event: QueueEvent, listener: Listener): () => void {
  openChannel();
  listeners[event].add(listener);
  return () => listeners[event].delete(listener);
}

export const syncQueue = {
  enqueue,
  enqueueBatch,
  getAll,
  getRicevute,
  getBozzeTecniche,
  countBozzeTecniche,
  getBozzaTecnica,
  salvaBozzaTecnica,
  accodaBozzaTecnica,
  recuperaAvanzamento,
  getPending,
  getQueueCount,
  remove,
  clearCompleted,
  retryFailed,
  riaccodaFallito,
  processQueue,
  registerProcessor,
  on,
};
