import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  syncQueue,
  type SyncItem,
  type SyncItemType,
} from "@/lib/campo/sync-queue";
import { isOnline, onNetworkChange } from "@/lib/campo/network-status";

interface OfflineSyncState {
  queueCount: number;
  isSyncing: boolean;
  lastSyncAt: number | null;
}

/**
 * Processor generico: mappa SyncItem → operazione Supabase.
 * Per type "checklist" e "rapportino_vocale" fa insert sulla tabella corrispondente.
 * Per type "foto" fa upload su storage.
 */
async function defaultProcessor(item: SyncItem): Promise<void> {
  switch (item.type) {
    case "checklist": {
      const { error } = await supabase
        .from("checklist_sicurezza")
        // @ts-expect-error — types generati non ancora aggiornati post-migration
        .upsert(item.payload, {
          onConflict: "company_id,operaio_id,data,turno",
        });
      if (error) throw new Error(error.message);
      return;
    }
    case "rapportino_vocale": {
      const { error } = await supabase
        // @ts-expect-error — types generati non ancora aggiornati post-migration
        .from("rapportini_vocali")
        // @ts-expect-error — types generati non ancora aggiornati post-migration
        .insert(item.payload);
      if (error) throw new Error(error.message);
      return;
    }
    case "foto": {
      const payload = item.payload as {
        bucket: string;
        path: string;
        blob: Blob;
        contentType: string;
        /** Riga da scrivere in `foto_cantiere` dopo l'upload. Senza questa la
         *  foto finirebbe nello storage ma non comparirebbe in nessuna
         *  galleria: i metadati (GPS, ora, commessa) vivono nella tabella. */
        riga?: Record<string, unknown>;
      };
      const { error } = await supabase.storage
        .from(payload.bucket)
        .upload(payload.path, payload.blob, {
          contentType: payload.contentType,
          upsert: false,
        });
      // 23505/"already exists": il file è già salito in un tentativo
      // precedente andato in timeout. Non è un errore: si prosegue con la
      // riga, altrimenti la foto resta orfana per sempre.
      const giaPresente = error?.message?.toLowerCase().includes("already exists") ?? false;
      if (error && !giaPresente) throw new Error(error.message);

      if (payload.riga) {
        const { error: rigaErr } = await supabase
          .from("foto_cantiere")
          // @ts-expect-error — types generati non ancora aggiornati post-migration
          .insert({ ...payload.riga, storage_path: payload.path });
        if (rigaErr) throw new Error(rigaErr.message);
      }
      return;
    }
    case "timbratura": {
      const { error } = await supabase
        .from("campo_timbrature")
        // @ts-expect-error — payload generic
        .insert(item.payload);
      if (error) throw new Error(error.message);
      return;
    }
    default:
      // Generic: prova insert su target table
      if (!item.target) throw new Error("Nessun target specificato");
      // @ts-expect-error — dynamic table name
      {
        const { error } = await supabase.from(item.target).insert(item.payload);
        if (error) throw new Error(error.message);
      }
  }
}

let processorRegistered = false;

function ensureProcessor(): void {
  if (processorRegistered) return;
  processorRegistered = true;
  syncQueue.registerProcessor(defaultProcessor);
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
} {
  const [state, setState] = useState<OfflineSyncState>({
    queueCount: 0,
    isSyncing: false,
    lastSyncAt: null,
  });

  // Init processor + listener
  useEffect(() => {
    ensureProcessor();

    const refreshCount = async (): Promise<void> => {
      const count = await syncQueue.getQueueCount();
      setState((s) => ({ ...s, queueCount: count }));
    };

    void refreshCount();

    const unsubChange = syncQueue.on("change", () => {
      void refreshCount();
    });

    const unsubNet = onNetworkChange((online) => {
      if (online) {
        void (async () => {
          setState((s) => ({ ...s, isSyncing: true }));
          await syncQueue.processQueue();
          setState((s) => ({ ...s, isSyncing: false, lastSyncAt: Date.now() }));
          await refreshCount();
        })();
      }
    });

    // Processa all'avvio se online
    if (isOnline()) {
      void (async () => {
        await syncQueue.processQueue();
        await refreshCount();
      })();
    }

    // Retry periodico ogni 30s se coda non vuota
    const interval = setInterval(() => {
      void (async () => {
        const count = await syncQueue.getQueueCount();
        if (count > 0 && isOnline()) {
          await syncQueue.processQueue();
          await refreshCount();
        }
      })();
    }, 30000);

    return () => {
      unsubChange();
      unsubNet();
      clearInterval(interval);
    };
  }, []);

  const enqueue = useCallback(
    async (type: SyncItemType, payload: unknown, target?: string): Promise<string> => {
      return syncQueue.enqueue({ type, payload, target });
    },
    [],
  );

  const sync = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, isSyncing: true }));
    await syncQueue.processQueue();
    setState((s) => ({ ...s, isSyncing: false, lastSyncAt: Date.now() }));
  }, []);

  return { ...state, enqueue, sync };
}
