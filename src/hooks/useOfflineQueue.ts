import { useState, useEffect, useCallback } from "react";
import { get, set, del, keys } from "idb-keyval";

export interface OfflineOperation {
  id: string;
  type: "insert" | "update";
  table: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

const QUEUE_PREFIX = "offline_op_";

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<OfflineOperation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadQueue = useCallback(async () => {
    const allKeys = await keys();
    const opKeys = allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX));
    const ops: OfflineOperation[] = [];
    for (const key of opKeys) {
      const op = await get<OfflineOperation>(key);
      if (op) ops.push(op);
    }
    ops.sort((a, b) => a.createdAt - b.createdAt);
    setQueue(ops);
    return ops;
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const enqueue = useCallback(
    async (op: Omit<OfflineOperation, "id" | "createdAt">) => {
      const id = `${QUEUE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const fullOp: OfflineOperation = { ...op, id, createdAt: Date.now() };
      await set(id, fullOp);
      await loadQueue();
    },
    [loadQueue],
  );

  const processQueue = useCallback(
    async (
      processFn: (op: OfflineOperation) => Promise<void>,
    ) => {
      if (isSyncing) return;
      setIsSyncing(true);
      try {
        const ops = await loadQueue();
        for (const op of ops) {
          try {
            await processFn(op);
            await del(op.id);
          } catch {
            // Leave in queue if failed
          }
        }
        await loadQueue();
      } finally {
        setIsSyncing(false);
      }
    },
    [isSyncing, loadQueue],
  );

  return { isOnline, queue, isSyncing, enqueue, processQueue };
}
