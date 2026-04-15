/**
 * Hook per gestire la personalizzazione dei widget del dashboard.
 * Salva le preferenze in localStorage per utente.
 * Supporta: visibilità (nascondi/mostra), ordinamento (drag & drop).
 */
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
  position: number;
}

const STORAGE_KEY = "dashboard-widgets-config";

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "ytd-revenue", label: "Fatturato YTD", visible: true, position: 0 },
  { id: "ceo-strip", label: "KPI Principali", visible: true, position: 1 },
  { id: "stat-cards", label: "Statistiche Rapide", visible: true, position: 2 },
  { id: "recent-orders", label: "Ordini Recenti", visible: true, position: 3 },
  { id: "monthly-balance", label: "Bilancio Mensile", visible: true, position: 4 },
  { id: "labor-costs", label: "Costo Manodopera", visible: true, position: 5 },
  { id: "aging-receivables", label: "Scadenziario Crediti", visible: true, position: 6 },
  { id: "warehouse-alerts", label: "Alert Magazzino", visible: true, position: 7 },
  { id: "supplier-payments", label: "Pagamenti Fornitori", visible: true, position: 8 },
  { id: "weekly-deadlines", label: "Scadenze Settimanali", visible: true, position: 9 },
  { id: "top-customers", label: "Top Clienti", visible: true, position: 10 },
];

function getStorageKey(userId?: string): string {
  return `${STORAGE_KEY}:${userId || "anonymous"}`;
}

function loadConfig(userId?: string): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const saved = JSON.parse(raw) as WidgetConfig[];
      // Merge with defaults (in case new widgets were added)
      const savedMap = new Map(saved.map((w) => [w.id, w]));
      return DEFAULT_WIDGETS.map((dw) => {
        const existing = savedMap.get(dw.id);
        if (existing) return { ...dw, visible: existing.visible, position: existing.position };
        return dw;
      }).sort((a, b) => a.position - b.position);
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_WIDGETS];
}

function saveConfig(userId: string | undefined, config: WidgetConfig[]): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(config));
  } catch {
    // localStorage full
  }
}

export function useDashboardWidgets() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadConfig(userId));
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Reload when userId changes
  useEffect(() => {
    setWidgets(loadConfig(userId));
  }, [userId]);

  const toggleWidget = useCallback(
    (id: string) => {
      setWidgets((prev) => {
        const next = prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
        saveConfig(userId, next);
        return next;
      });
    },
    [userId],
  );

  const moveWidget = useCallback(
    (id: string, direction: "up" | "down") => {
      setWidgets((prev) => {
        const idx = prev.findIndex((w) => w.id === id);
        if (idx < 0) return prev;
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
        // Update positions
        const updated = next.map((w, i) => ({ ...w, position: i }));
        saveConfig(userId, updated);
        return updated;
      });
    },
    [userId],
  );

  const resetToDefault = useCallback(() => {
    const defaults = [...DEFAULT_WIDGETS];
    saveConfig(userId, defaults);
    setWidgets(defaults);
  }, [userId]);

  const isWidgetVisible = useCallback(
    (id: string): boolean => {
      return widgets.find((w) => w.id === id)?.visible ?? true;
    },
    [widgets],
  );

  const getVisibleWidgets = useCallback((): WidgetConfig[] => {
    return widgets.filter((w) => w.visible).sort((a, b) => a.position - b.position);
  }, [widgets]);

  return {
    widgets,
    isCustomizing,
    setIsCustomizing,
    toggleWidget,
    moveWidget,
    resetToDefault,
    isWidgetVisible,
    getVisibleWidgets,
  };
}
