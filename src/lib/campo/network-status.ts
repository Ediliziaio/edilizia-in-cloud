/**
 * Utility per monitorare lo stato della connessione di rete.
 * Fornisce sia API imperative sia un event emitter per listener.
 */

type NetworkListener = (online: boolean) => void;

const listeners = new Set<NetworkListener>();

function notify(online: boolean): void {
  listeners.forEach((l) => {
    try {
      l(online);
    } catch (error) {
      console.error("[network-status] listener error", error);
    }
  });
}

let initialized = false;

function ensureInitialized(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", () => notify(true));
  window.addEventListener("offline", () => notify(false));
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function onNetworkChange(listener: NetworkListener): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Ping attivo: prova a contattare l'endpoint Supabase per verificare la
 * connettività reale (utile quando navigator.onLine è true ma manca internet).
 */
export async function pingServer(timeoutMs = 3000): Promise<boolean> {
  if (typeof fetch === "undefined") return isOnline();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // HEAD verso index.html del dominio corrente (sempre raggiungibile se online)
    const response = await fetch("/", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}
