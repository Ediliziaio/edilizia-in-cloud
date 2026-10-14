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

export type SyncItemType =
  | "checklist"
  | "rapportino_vocale"
  | "timbratura"
  | "foto"
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
  /** Path del bucket (per upload file) oppure endpoint tabella */
  target?: string;
  /** Identità stabile anche per gli elementi delle vecchie versioni. */
  operationId?: string;
}

const DB_NAME = "campo-sync-queue";
const DB_VERSION = 1;
const STORE_NAME = "items";
const MAX_RETRY = 5;
const BACKOFF_BASE_MS = 1000;
const SYNC_LEASE_MS = 5 * 60_000;

export class SyncPermanentError extends Error {}
export class SyncDeferredError extends Error {}
export function syncItemScope(item: SyncItem) {
  const p = item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : {};
  const row = (item.type === "foto" ? p.riga : p) as Record<string, unknown> | undefined;
  const legacyAudio = item.type === "foto" && p.bucket === "campo-audio" && typeof p.path === "string";
  const owner = row?.user_id ?? row?.operaio_id ?? row?.uploaded_by ?? (legacyAudio ? (p.path as string).split("/")[0] : undefined);
  return { owner, companyId: row?.company_id, legacyAudio };
}
export function canProcessSyncItem(item: SyncItem, now = Date.now()): boolean {
  if (item.status === "done" || item.retryCount >= MAX_RETRY) return false;
  if (item.status === "syncing" && now - item.updatedAt < SYNC_LEASE_MS) return false;
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

type QueueEvent = "change" | "processed" | "failed";
type Listener = () => void;

let dbPromise: Promise<IDBDatabase> | null = null;
const listeners: Record<QueueEvent, Set<Listener>> = {
  change: new Set(),
  processed: new Set(),
  failed: new Set(),
};

function emit(event: QueueEvent): void {
  listeners[event].forEach((l) => {
    try {
      l();
    } catch (e) {
      console.error("[sync-queue] listener error", e);
    }
  });
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
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
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

async function enqueue<T>(
  item: Pick<SyncItem<T>, "type" | "payload" | "target">,
): Promise<string> {
  const db = await openDB();
  const id = generateId();
  const now = Date.now();
  const fullItem: SyncItem<T> = {
    id,
    operationId: id,
    type: item.type,
    payload: item.payload,
    target: item.target,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    status: "pending",
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(fullItem);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emit("change");
  return id;
}

async function getAll(): Promise<SyncItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
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

async function updateItem(item: SyncItem): Promise<void> {
  const db = await openDB();
  item.updatedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emit("change");
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
    if (item.status !== "failed" || !eligible(item)) continue;
    await updateItem({ ...item, status: "pending", retryCount: 0, lastError: undefined });
  }
}

/**
 * Processore registrato dall'app — riceve un SyncItem e tenta l'upload verso Supabase.
 * Deve throware su errore per attivare il retry.
 */
export type SyncProcessor = (item: SyncItem) => Promise<void>;

let processor: SyncProcessor | null = null;

function registerProcessor(fn: SyncProcessor): void {
  processor = fn;
}

let isProcessing = false;

async function processQueueUnlocked(): Promise<void> {
  if (isProcessing) return;
  if (!processor) {
    console.warn("[sync-queue] nessun processor registrato");
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  isProcessing = true;
  try {
    const items = await getPending();
    for (const item of items) {
      // Backoff esponenziale: se retryCount alto, salta se non è ancora tempo
      if (item.retryCount > 0) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, item.retryCount - 1);
        const elapsed = Date.now() - item.updatedAt;
        if (elapsed < delay) continue;
      }
      item.status = "syncing";
      item.operationId = await syncOperationId(item);
      await updateItem(item);
      try {
        await processor!(item);
        item.status = "done";
        item.lastError = undefined;
        await updateItem(item);
        emit("processed");
        // Rimuovi subito quelli done (cleanup)
        await remove(item.id);
      } catch (error) {
        if (error instanceof SyncDeferredError) {
          item.status = "pending";
          await updateItem(item);
          continue;
        }
        item.retryCount += 1;
        if (error instanceof SyncPermanentError) item.retryCount = MAX_RETRY;
        item.lastError = error instanceof Error ? error.message : String(error);
        item.status = item.retryCount >= MAX_RETRY ? "failed" : "pending";
        await updateItem(item);
        emit("failed");
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function processQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request("campo-sync-queue", { ifAvailable: true }, async lock => {
      if (lock) await processQueueUnlocked();
    });
  } else await processQueueUnlocked();
}

function on(event: QueueEvent, listener: Listener): () => void {
  listeners[event].add(listener);
  return () => listeners[event].delete(listener);
}

export const syncQueue = {
  enqueue,
  getAll,
  getPending,
  getQueueCount,
  remove,
  clearCompleted,
  retryFailed,
  processQueue,
  registerProcessor,
  on,
};
