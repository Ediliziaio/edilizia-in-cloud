/**
 * useColumnVisibility — persisted column toggles per CustomersList
 * Estratto da CustomersList.tsx (MP-CAN-001 Fase 2).
 *
 * Stato locale + sync con localStorage (chiave `customers-list-columns-v1`).
 */
import { useState, useEffect } from "react";
import { COLUMN_STORAGE_KEY, DEFAULT_VISIBLE, type ColumnKey } from "../constants";

export function useColumnVisibility() {
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE;
    try {
      const stored = window.localStorage.getItem(COLUMN_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<ColumnKey, boolean>>;
        return { ...DEFAULT_VISIBLE, ...parsed };
      }
    } catch { /* ignore */ }
    return DEFAULT_VISIBLE;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visible));
    } catch { /* ignore */ }
  }, [visible]);

  const toggle = (k: ColumnKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));
  const resetColumns = () => setVisible(DEFAULT_VISIBLE);
  return { visible, toggle, resetColumns };
}
