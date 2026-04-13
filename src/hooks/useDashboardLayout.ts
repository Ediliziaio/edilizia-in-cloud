import { useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type DashboardTab = "panoramica" | "pipeline" | "attivita" | "team" | "fonti" | "trend" | "commerciale";

export interface TabConfig {
  id: DashboardTab;
  label: string;
  icon: string;
  visible: boolean;
}

/** Versione incrementale — incrementa ogni volta che aggiungi un tab nuovo
 *  per forzare il merge su client che hanno la versione precedente. */
const TABS_VERSION = 2;

const DEFAULT_TABS: TabConfig[] = [
  { id: "panoramica", label: "Panoramica", icon: "LayoutDashboard", visible: true },
  { id: "pipeline", label: "Pipeline", icon: "BarChart3", visible: true },
  { id: "attivita", label: "Attività", icon: "Phone", visible: true },
  { id: "team", label: "Team", icon: "Users", visible: true },
  { id: "fonti", label: "Fonti & ROI", icon: "Radio", visible: true },
  { id: "trend", label: "Trend", icon: "TrendingUp", visible: true },
  { id: "commerciale", label: "Commerciale", icon: "Target", visible: true },
];

/** Set di tutti gli id validi (per rimuovere tab obsoleti) */
const VALID_TAB_IDS = new Set<string>(DEFAULT_TABS.map(t => t.id));

function getStorageKey(userId?: string, companyId?: string) {
  return `dashboard-layout-${userId}-${companyId}`;
}

/**
 * Carica i tab da localStorage e li sincronizza con DEFAULT_TABS:
 * - Aggiunge tab nuovi che mancano nel salvataggio
 * - Rimuove tab obsoleti che non esistono più in DEFAULT_TABS
 * - Aggiorna label/icon se sono cambiati
 */
function loadAndMergeTabs(storageKey: string): { tabs: TabConfig[]; activeTab: DashboardTab; merged: boolean } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { tabs: DEFAULT_TABS, activeTab: "panoramica", merged: false };

    const parsed = JSON.parse(raw);
    const savedVersion = parsed.version ?? 1;
    const savedActiveTab: DashboardTab = parsed.activeTab || "panoramica";

    if (!parsed.tabs || !Array.isArray(parsed.tabs) || savedVersion >= TABS_VERSION) {
      // Versione corrente o nessun tab salvato — usa come è
      const savedTabs = (parsed.tabs && Array.isArray(parsed.tabs)) ? parsed.tabs as TabConfig[] : DEFAULT_TABS;
      // Comunque controlla merge per sicurezza
      const savedIds = new Set(savedTabs.map((t: TabConfig) => t.id));
      const missingTabs = DEFAULT_TABS.filter(dt => !savedIds.has(dt.id));
      if (missingTabs.length > 0) {
        const merged = [...savedTabs.filter((t: TabConfig) => VALID_TAB_IDS.has(t.id)), ...missingTabs];
        return { tabs: merged, activeTab: savedActiveTab, merged: true };
      }
      return { tabs: savedTabs, activeTab: savedActiveTab, merged: false };
    }

    // Versione vecchia — forza merge completo
    const savedTabs = parsed.tabs as TabConfig[];
    const savedIds = new Set(savedTabs.map((t: TabConfig) => t.id));
    // Mantieni tab salvati validi + aggiungi nuovi
    const validSaved = savedTabs.filter((t: TabConfig) => VALID_TAB_IDS.has(t.id));
    const missingTabs = DEFAULT_TABS.filter(dt => !savedIds.has(dt.id));
    const merged = [...validSaved, ...missingTabs];
    return { tabs: merged, activeTab: savedActiveTab, merged: true };
  } catch {
    return { tabs: DEFAULT_TABS, activeTab: "panoramica", merged: false };
  }
}

export function useDashboardLayout() {
  const { user, effectiveCompany } = useAuth();
  const storageKey = getStorageKey(user?.id, effectiveCompany?.id);

  const [{ tabs: initialTabs, activeTab: initialActiveTab, merged: needsPersist }] = useState(() =>
    loadAndMergeTabs(storageKey)
  );

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialActiveTab);
  const [tabs, setTabs] = useState<TabConfig[]>(initialTabs);

  // Se il merge ha aggiunto tab nuovi, persisti subito per evitare loop
  useEffect(() => {
    if (needsPersist) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ activeTab: initialActiveTab, tabs: initialTabs, version: TABS_VERSION }));
      } catch { /* Safari Private Browsing */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((newActiveTab: DashboardTab, newTabs: TabConfig[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ activeTab: newActiveTab, tabs: newTabs, version: TABS_VERSION }));
    } catch { /* storage non disponibile — silenzioso */ }
  }, [storageKey]);

  const switchTab = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
    persist(tab, tabs);
  }, [tabs, persist]);

  const toggleTabVisibility = useCallback((tabId: DashboardTab) => {
    setTabs(prev => {
      const next = prev.map(t => t.id === tabId ? { ...t, visible: !t.visible } : t);
      // Ensure at least one tab is visible
      if (next.every(t => !t.visible)) return prev;
      persist(activeTab, next);
      return next;
    });
  }, [activeTab, persist]);

  const visibleTabs = useMemo(() => tabs.filter(t => t.visible), [tabs]);

  return { activeTab, switchTab, tabs, visibleTabs, toggleTabVisibility };
}
