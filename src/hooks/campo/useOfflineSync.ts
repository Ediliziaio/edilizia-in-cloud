import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { processCampoOffline } from "@/lib/campo/offlineProcessor";
import {
  syncQueue,
  syncItemScope,
  type SyncItemType,
} from "@/lib/campo/sync-queue";
import { isOnline, onNetworkChange } from "@/lib/campo/network-status";

interface OfflineSyncState {
  queueCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
  failedCount: number;
  lastError: string | null;
}

let processorRegistered = false;
let pollUsers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function ensureProcessor(): void {
  if (processorRegistered) return;
  processorRegistered = true;
  syncQueue.registerProcessor(processCampoOffline);
}

/**
 * Hook React per gestire la sincronizzazione offline.
 * - Mostra conteggio elementi in coda
 * - Processa automaticamente al ritorno online
 * - Espone `enqueue` e `sync` per uso manuale
 */
export function useOfflineSync(): OfflineSyncState & {
  enqueue: (type: SyncItemType, payload: unknown, target?: string) => Promise<string>;
  sync: () => Promise<void>;
  retry: () => Promise<void>;
} {
  const { user, profile } = useAuth();
  const [state, setState] = useState<OfflineSyncState>({
    queueCount: 0,
    isSyncing: false,
    lastSyncAt: null,
    failedCount: 0,
    lastError: null,
  });

  // Init processor + listener
  useEffect(() => {
    ensureProcessor();
    let active = true;

    const refreshCount = async (): Promise<void> => {
      try {
        const items = (await syncQueue.getAll()).filter(i => {
          const scope = syncItemScope(i);
          return scope.owner === user?.id && (scope.companyId === profile?.company_id || scope.legacyAudio) && i.status !== "done";
        });
        const failed = items.filter(i => i.status === "failed");
        if (active) setState(s => ({ ...s, queueCount: items.length, failedCount: failed.length, lastError: failed[0]?.lastError ?? null }));
      } catch { if (active) setState(s => ({ ...s, lastError: "Non riesco a leggere la coda del telefono." })); }
    };

    const run = async () => {
      if (!isOnline()) return;
      if (active) setState(s => ({ ...s, isSyncing: true }));
      try { await syncQueue.processQueue(); await refreshCount(); }
      catch { if (active) setState(s => ({ ...s, lastError: "Sincronizzazione non riuscita: i dati restano sul telefono." })); }
      finally { if (active) setState(s => ({ ...s, isSyncing: false, lastSyncAt: Date.now() })); }
    };

    void refreshCount();

    const unsubChange = syncQueue.on("change", () => {
      void refreshCount();
    });

    const unsubNet = onNetworkChange((online) => {
      if (online) {
        void run();
      }
    });

    // Processa all'avvio se online
    if (isOnline()) {
      void run();
    }

    // Retry periodico ogni 30s se coda non vuota
    // Un timer per tutta l'app, non uno per ogni schermata che usa il hook.
    pollUsers += 1;
    if (!pollTimer) pollTimer = setInterval(() => {
      if (!isOnline()) return;
      void syncQueue.getPending().then(items => items.length ? syncQueue.processQueue() : undefined).catch(() => { /* Il modulo mantiene visibili gli errori e i dati. */ });
    }, 30000);

    return () => {
      unsubChange();
      unsubNet();
      active = false; pollUsers -= 1;
      if (!pollUsers && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };
  }, [user?.id, profile?.company_id]);

  const enqueue = useCallback(
    async (type: SyncItemType, payload: unknown, target?: string): Promise<string> => {
      return syncQueue.enqueue({ type, payload, target });
    },
    [],
  );

  const sync = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isSyncing: true }));
    try {
      await syncQueue.processQueue();
      setState(s => ({ ...s, lastSyncAt: Date.now() }));
    } catch { setState(s => ({ ...s, lastError: "Sincronizzazione non riuscita: i dati restano sul telefono." })); }
    finally { setState(s => ({ ...s, isSyncing: false })); }
  }, []);

  const retry = useCallback(async () => {
    try { await syncQueue.retryFailed(i => {
      const scope = syncItemScope(i);
      return scope.owner === user?.id && (scope.companyId === profile?.company_id || scope.legacyAudio);
    }); await sync(); }
    catch { setState(s => ({ ...s, lastError: "Non riesco a riaprire la coda: i dati sono conservati." })); }
  }, [user?.id, profile?.company_id, sync]);

  return { ...state, enqueue, sync, retry };
}
