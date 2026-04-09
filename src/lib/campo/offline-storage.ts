/**
 * Wrapper IndexedDB per cache locale dati campo (offline-first).
 * TTL per dati cantiere: 24h, per lista attività: 1h.
 * Zero dipendenze esterne — usa IndexedDB nativo.
 */

const DB_NAME = "campo-offline-cache";
const DB_VERSION = 1;

type StoreName = "cantieri" | "attivita" | "materiali" | "misc";

const STORES: StoreName[] = ["cantieri", "attivita", "materiali", "misc"];

interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt: number;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "key" });
        }
      }
    };
  });
  return dbPromise;
}

function isValidStore(store: string): store is StoreName {
  return (STORES as readonly string[]).includes(store);
}

export async function setCache<T>(
  store: StoreName,
  key: string,
  value: T,
  ttlMs: number,
): Promise<void> {
  if (!isValidStore(store)) return;
  try {
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      expiresAt: now + ttlMs,
      createdAt: now,
    };
    tx.objectStore(store).put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("[offline-storage] setCache fallito", error);
  }
}

export async function getCache<T>(
  store: StoreName,
  key: string,
): Promise<T | null> {
  if (!isValidStore(store)) return null;
  try {
    const db = await openDB();
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    const entry = await new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as CacheEntry<T> | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      // Scaduto — elimina asincrono
      deleteCache(store, key).catch(() => undefined);
      return null;
    }
    return entry.value;
  } catch (error) {
    console.error("[offline-storage] getCache fallito", error);
    return null;
  }
}

export async function deleteCache(
  store: StoreName,
  key: string,
): Promise<void> {
  if (!isValidStore(store)) return;
  try {
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
  } catch (error) {
    console.error("[offline-storage] deleteCache fallito", error);
  }
}

export async function clearStore(store: StoreName): Promise<void> {
  if (!isValidStore(store)) return;
  try {
    const db = await openDB();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
  } catch (error) {
    console.error("[offline-storage] clearStore fallito", error);
  }
}

/**
 * Cleanup automatico: rimuove tutte le entry scadute da tutti gli store.
 * Esegui periodicamente (es. al boot app).
 */
export async function cleanupExpired(): Promise<number> {
  let removed = 0;
  try {
    const db = await openDB();
    for (const store of STORES) {
      const tx = db.transaction(store, "readwrite");
      const objectStore = tx.objectStore(store);
      const req = objectStore.openCursor();
      await new Promise<void>((resolve) => {
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          const entry = cursor.value as CacheEntry;
          if (entry.expiresAt < Date.now()) {
            cursor.delete();
            removed += 1;
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
      });
    }
  } catch (error) {
    console.error("[offline-storage] cleanupExpired fallito", error);
  }
  return removed;
}

export const CACHE_TTL = {
  CANTIERI: 24 * 60 * 60 * 1000, // 24h
  ATTIVITA: 60 * 60 * 1000, // 1h
  MATERIALI: 12 * 60 * 60 * 1000, // 12h
  MISC: 30 * 60 * 1000, // 30m
} as const;
