/**
 * useOnlineStatus — v8.6.91
 *
 * Hook che monitora lo stato della connessione di rete usando le API browser
 * native (navigator.onLine + eventi online/offline).
 *
 * Bonus v8.6.91: heartbeat ping ogni 30s al backend per verificare connettività
 * VERA (non solo "interfaccia di rete attiva"). Sui device cantiere,
 * navigator.onLine dice spesso "true" anche con captive portal o segnale
 * debolissimo.
 *
 * Backward-compat: la chiamata `useOnlineStatus()` ritorna ancora `boolean`
 * (true = online); è il default export. Per dettagli usa `useOnlineStatusDetail()`.
 */
import { useState, useEffect } from "react";

const HEARTBEAT_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/auth/v1/health`;
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 5_000;

async function pingBackend(): Promise<boolean> {
  if (!HEARTBEAT_URL.startsWith("https://") || !navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT);
    const res = await fetch(HEARTBEAT_URL, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    // 401/404 = server raggiunto comunque
    return res.ok || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

export interface OnlineStatusDetail {
  /** navigator.onLine — interfaccia di rete attiva. */
  isOnline: boolean;
  /** Heartbeat → connessione vera verso il backend. */
  isReachable: boolean;
  /** Combined: false solo se VERAMENTE offline. */
  isOffline: boolean;
  /** Timestamp Date.now() quando si è andati offline. NULL se online. */
  offlineSince: number | null;
  /** Forza un check manuale (es. dopo click "Riprova"). */
  retry: () => void;
}

/** Versione dettagliata: stato + heartbeat + offlineSince + retry. */
export function useOnlineStatusDetail(): OnlineStatusDetail {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isReachable, setIsReachable] = useState<boolean>(true);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);

  const retry = () => {
    void pingBackend().then((ok) => {
      setIsReachable(ok);
      setIsOnline(navigator.onLine);
      if (ok) setOfflineSince(null);
      else if (offlineSince === null) setOfflineSince(Date.now());
    });
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void pingBackend().then((ok) => {
        setIsReachable(ok);
        if (ok) setOfflineSince(null);
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsReachable(false);
      setOfflineSince((prev) => prev ?? Date.now());
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(() => {
      if (!navigator.onLine) return;
      void pingBackend().then((ok) => {
        setIsReachable((prev) => {
          if (!prev && ok) setOfflineSince(null);
          if (prev && !ok) setOfflineSince(Date.now());
          return ok;
        });
      });
    }, HEARTBEAT_INTERVAL);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOffline = !isOnline || !isReachable;
  return { isOnline, isReachable, isOffline, offlineSince, retry };
}

/** Versione semplice (backward-compat): true se online + raggiungibile. */
export function useOnlineStatus(): boolean {
  const detail = useOnlineStatusDetail();
  return !detail.isOffline;
}
