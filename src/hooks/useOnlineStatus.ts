/**
 * useOnlineStatus — v8.6.93
 *
 * Singleton globale per evitare N interval/listener su mounted multipli.
 * Stato condiviso via store interno + subscribers React.
 *
 *  - 1 solo `setInterval` heartbeat ogni 30s a `/auth/v1/health`
 *  - 1 sola coppia di listener `online`/`offline`
 *  - N componenti subscriber che vengono notificati su change
 */
import { useState, useEffect, useSyncExternalStore } from "react";

const HEARTBEAT_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/auth/v1/health`;
const HEARTBEAT_INTERVAL = 30_000;
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
  interval: null as number | null,

  subscribe(listener: Listener) {
    store.listeners.add(listener);
    if (!store.inited) store.init();
    return () => {
      store.listeners.delete(listener);
      // NB: non spegniamo il singleton anche se 0 listener — il costo è
      // 1 fetch/30s, e l'overhead di re-init è > del beneficio.
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

    const onOnline = () => {
      store.setState({ isOnline: true });
      void store.pingBackend();
    };
    const onOffline = () => {
      store.setState({
        isOnline: false,
        isReachable: false,
        offlineSince: store.state.offlineSince ?? Date.now(),
      });
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    store.interval = window.setInterval(() => {
      if (!navigator.onLine) return;
      void store.pingBackend();
    }, HEARTBEAT_INTERVAL);
  },

  async pingBackend() {
    if (!HEARTBEAT_URL.startsWith("https://") || !navigator.onLine) {
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT);
      const res = await fetch(HEARTBEAT_URL, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      const ok = res.ok || res.status === 401 || res.status === 404;
      store.setState({
        isReachable: ok,
        offlineSince: ok ? null : (store.state.offlineSince ?? Date.now()),
      });
    } catch {
      store.setState({
        isReachable: false,
        offlineSince: store.state.offlineSince ?? Date.now(),
      });
    }
  },
};

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

// ESM module-level: keep static for tree-shaker
void useState;
void useEffect;
