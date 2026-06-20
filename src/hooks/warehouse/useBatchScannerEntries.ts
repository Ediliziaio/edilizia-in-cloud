import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";

export const DUPLICATE_THROTTLE_MS = 2000;

interface UseBatchScannerEntriesOptions {
  initialEntries?: BatchScanEntry[];
  onEntriesChange?: (entries: BatchScanEntry[]) => void;
}

interface PromoteNoMatchResult {
  stockItemId: string;
  itemName: string;
  trackingMode: "fungible" | "serialized";
}

export function newBatchScanClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useBatchScannerEntries({
  initialEntries,
  onEntriesChange,
}: UseBatchScannerEntriesOptions) {
  const [entries, setEntries] = useState<BatchScanEntry[]>(initialEntries ?? []);
  const lastScanRef = useRef<{ code: string; ts: number } | null>(null);

  // Mantiene il comportamento storico: idrata solo al mount.
  useEffect(() => {
    if (initialEntries && initialEntries.length > 0) {
      setEntries(initialEntries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onEntriesChange?.(entries);
  }, [entries, onEntriesChange]);

  const trackDuplicate = useCallback((code: string, now: number) => {
    if (
      lastScanRef.current &&
      lastScanRef.current.code === code &&
      now - lastScanRef.current.ts < DUPLICATE_THROTTLE_MS
    ) {
      return true;
    }
    lastScanRef.current = { code, ts: now };
    return false;
  }, []);

  const appendEntry = useCallback((entry: BatchScanEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const mergeResolvedEntry = useCallback((entry: BatchScanEntry, odaItemId: string | null) => {
    setEntries((prev) => {
      const resolvedItemId = entry.stockItemId;
      const resolvedTracking = entry.trackingMode;
      const resolvedSerial = entry.serialNumbers[0] ?? null;

      if (resolvedTracking === "fungible") {
        const existingIdx = prev.findIndex(
          (e) =>
            e.stockItemId === resolvedItemId &&
            e.trackingMode === "fungible" &&
            (odaItemId ? e.odaItemId === odaItemId : !e.odaItemId),
        );
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: next[existingIdx].quantity + 1,
            scannedAt: entry.scannedAt,
          };
          return next;
        }
      }

      if (resolvedTracking === "serialized" && resolvedSerial) {
        const existingIdx = prev.findIndex(
          (e) =>
            e.stockItemId === resolvedItemId &&
            e.trackingMode === "serialized" &&
            (odaItemId ? e.odaItemId === odaItemId : !e.odaItemId),
        );
        if (existingIdx >= 0) {
          if (prev[existingIdx].serialNumbers.includes(resolvedSerial)) {
            return prev;
          }
          const next = [...prev];
          const serials = [...next[existingIdx].serialNumbers, resolvedSerial];
          next[existingIdx] = {
            ...next[existingIdx],
            serialNumbers: serials,
            quantity: serials.length,
            scannedAt: entry.scannedAt,
          };
          return next;
        }
      }

      return [...prev, { ...entry, odaItemId }];
    });
  }, []);

  const updateEntryQty = useCallback((uuid: string, delta: number) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.clientUuid === uuid && entry.trackingMode === "fungible"
          ? { ...entry, quantity: Math.max(1, entry.quantity + delta) }
          : entry,
      ),
    );
  }, []);

  const removeEntry = useCallback((uuid: string) => {
    setEntries((prev) => prev.filter((entry) => entry.clientUuid !== uuid));
  }, []);

  /** Entrata merce: prezzo d'acquisto per riga, editabile in revisione. */
  const updateEntryPrice = useCallback((uuid: string, price: number | undefined) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.clientUuid === uuid ? { ...entry, purchasePrice: price } : entry,
      ),
    );
  }, []);

  const promoteNoMatch = useCallback((uuid: string, result: PromoteNoMatchResult) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.clientUuid === uuid
          ? {
              ...entry,
              stockItemId: result.stockItemId,
              itemName: result.itemName,
              trackingMode: result.trackingMode,
              serialNumbers:
                result.trackingMode === "serialized" && entry.serialNumbers.length === 0
                  ? [entry.rawCode]
                  : entry.serialNumbers,
            }
          : entry,
      ),
    );
  }, []);

  const totalScans = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.quantity, 0),
    [entries],
  );

  const noMatchCount = useMemo(
    () => entries.filter((entry) => entry.stockItemId === null).length,
    [entries],
  );

  return {
    entries,
    appendEntry,
    mergeResolvedEntry,
    updateEntryQty,
    updateEntryPrice,
    removeEntry,
    promoteNoMatch,
    trackDuplicate,
    totalScans,
    noMatchCount,
  };
}
