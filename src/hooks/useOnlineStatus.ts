/**
 * useOnlineStatus — v8.6.93
 *
 * Singleton globale per evitare N interval/listener su mounted multipli.
 * Stato condiviso via store interno + subscribers React.
 *
 *  - 1 sola coppia di listener `online`/`offline` (fonte principale)
 *  - heartbeat a `/auth/v1/health` ogni 120s, solo a scheda visibile
 *  - `segnalaErroreDiRete()`: le query vere fallite per rete fanno una verifica
 *  - N componenti subscriber che vengono notificati su change
 */
import { useSyncExternalStore } from "react";
import { avviaIntervalloVisibile } from "@/lib/intervalloVisibile";

const HEARTBEAT_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/auth/v1/health`;
const HEARTBEAT_PING_URL = (() => {
  const chiave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  return chiave ? `${HEARTBEAT_URL}?apikey=${encodeURIComponent(chiave)}` : HEARTBEAT_URL;
})();
// 15/09/2026: 30s → 120s e fermo a scheda nascosta. Ogni scheda aperta faceva
// ~240 ping/ora (più il preflight CORS), anche di notte. Il cambio di rete lo
// dicono già gli eventi online/offline e gli errori delle query vere.
const HEARTBEAT_INTERVAL = 120_000;
const HEARTBEAT_TIMEOUT = 5_000;

export interface OnlineStatusDetail {
  isOnline: boolean;
  isReachable: boolean;
  isOffline: boolean;
  offlineSince: number | null;
}

// ─── Store singleton ────────────────────────────────────────────────────────
type Listener = () => void;

const store = {
  state: {
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isReachable: true,
    offlineSince: null as number | null,
  },
  listeners: new Set<Listener>(),
  inited: false,
  stopHeartbeat: null as (() => void) | null,
  onlineHandler: null as (() => void) | null,
  offlineHandler: null as (() => void) | null,
  pingInFlight: null as Promise<void> | null,

  subscribe(listener: Listener) {
    store.listeners.add(listener);
    if (!store.inited) store.init();
    return () => {
      store.listeners.delete(listener);
      if (store.listeners.size === 0) store.destroy();
    };
  },

  emit() {
    for (const l of store.listeners) l();
  },

  setState(patch: Partial<typeof store.state>) {
    const next = { ...store.state, ...patch };
    // Skip update se identico (evita re-render inutili)
    if (
      next.isOnline === store.state.isOnline &&
      next.isReachable === store.state.isReachable &&
      next.offlineSince === store.state.offlineSince
    ) {
      return;
    }
    store.state = next;
    store.emit();
  },

  init() {
    if (store.inited || typeof window === "undefined") return;
    store.inited = true;

    store.onlineHandler = () => {
      store.setState({ isOnline: true });
      void store.pingBackend();
    };
    store.offlineHandler = () => {
      store.setState({
        isOnline: false,
        isReachable: false,
        offlineSince: store.state.offlineSince ?? Date.now(),
      });
    };

    window.addEventListener("online", store.onlineHandler);
    window.addEventListener("offline", store.offlineHandler);

    // Al ritorno sulla scheda fa subito un ping (il PC può essersi addormentato).
    store.stopHeartbeat = avviaIntervalloVisibile(() => {
      if (!navigator.onLine) return;
      void store.pingBackend();
    }, HEARTBEAT_INTERVAL);
  },

  destroy() {
    if (typeof window !== "undefined") {
      if (store.onlineHandler) window.removeEventListener("online", store.onlineHandler);
      if (store.offlineHandler) window.removeEventListener("offline", store.offlineHandler);
    }
    store.stopHeartbeat?.();
    store.stopHeartbeat = null;
    store.onlineHandler = null;
    store.offlineHandler = null;
    store.inited = false;
  },

  pingBackend() {
    if (!HEARTBEAT_URL.startsWith("https://") || !navigator.onLine) {
      return Promise.resolve();
    }
    if (store.pingInFlight) return store.pingInFlight;

    store.pingInFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT);
      try {
        // 15/09/2026: la chiave pubblica va nell'indirizzo, non nell'header.
        // Con l'header il GET non è più "semplice" e il browser manda un
        // preflight OPTIONS in più; senza chiave il gateway risponde 401 e la
        // console si riempie di errori rossi. Con `?apikey=` risponde 200.
        // Qualunque risposta HTTP = raggiungibile; solo l'errore di rete no.
        await fetch(HEARTBEAT_PING_URL, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        store.setState({ isReachable: true, offlineSince: null });
      } catch {
        store.setState({
          isReachable: false,
          offlineSince: store.state.offlineSince ?? Date.now(),
        });
      } finally {
        clearTimeout(timer);
        store.pingInFlight = null;
      }
    })();

    return store.pingInFlight;
  },
};

/**
 * Da chiamare quando una query vera fallisce per errore di rete: verifica
 * subito la raggiungibilità invece di aspettare il prossimo heartbeat.
 * No-op se nessun componente ascolta lo stato.
 */
export function segnalaErroreDiRete(): void {
  if (!store.inited) return;
  void store.pingBackend();
}

// useSyncExternalStore richiede getSnapshot stabile: ritorniamo lo state object
// completo (referential identity preservata da setState).
const getSnapshot = () => store.state;
const subscribe = (cb: Listener) => store.subscribe(cb);

/** Versione dettagliata: oggetto con isOnline/isReachable/offlineSince + retry. */
export function useOnlineStatusDetail(): OnlineStatusDetail & { retry: () => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    isOnline: snapshot.isOnline,
    isReachable: snapshot.isReachable,
    isOffline: !snapshot.isOnline || !snapshot.isReachable,
    offlineSince: snapshot.offlineSince,
    retry: () => void store.pingBackend(),
  };
}

/** Versione semplice (backward-compat): true se online + raggiungibile. */
export function useOnlineStatus(): boolean {
  const detail = useOnlineStatusDetail();
  return !detail.isOffline;
}
