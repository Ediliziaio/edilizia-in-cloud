import { useCallback, useMemo } from "react";
import type { BatchScanEntry, BatchScanMode } from "@/components/warehouse/BatchBarcodeScanner";

interface UseBatchScannerSubmitOptions {
  mode: BatchScanMode;
  entries: BatchScanEntry[];
  noMatchCount: number;
  invalidSerializedCount: number;
  isConfirming: boolean;
  onConfirm?: () => void;
}

export function useBatchScannerSubmit({
  mode,
  entries,
  noMatchCount,
  invalidSerializedCount,
  isConfirming,
  onConfirm,
}: UseBatchScannerSubmitOptions) {
  const canConfirm = useMemo(
    () =>
      mode !== "lookup" &&
      entries.length > 0 &&
      !isConfirming &&
      noMatchCount === 0 &&
      invalidSerializedCount === 0,
    [entries.length, invalidSerializedCount, isConfirming, mode, noMatchCount],
  );

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm?.();
  }, [canConfirm, onConfirm]);

  return { canConfirm, handleConfirm };
}
