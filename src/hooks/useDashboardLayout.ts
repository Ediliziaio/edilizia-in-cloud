import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type DashboardTab = "panoramica" | "pipeline" | "attivita" | "team" | "fonti" | "trend";

export interface TabConfig {
  id: DashboardTab;
  label: string;
  icon: string;
  visible: boolean;
}

const DEFAULT_TABS: TabConfig[] = [
  { id: "panoramica", label: "Panoramica", icon: "LayoutDashboard", visible: true },
  { id: "pipeline", label: "Pipeline", icon: "BarChart3", visible: true },
  { id: "attivita", label: "Attività", icon: "Phone", visible: true },
  { id: "team", label: "Team", icon: "Users", visible: true },
  { id: "fonti", label: "Fonti & ROI", icon: "Radio", visible: true },
  { id: "trend", label: "Trend", icon: "TrendingUp", visible: true },
];

function getStorageKey(userId?: string, companyId?: string) {
  return `dashboard-layout-${userId}-${companyId}`;
}

export function useDashboardLayout() {
  const { user, effectiveCompany } = useAuth();
  const storageKey = getStorageKey(user?.id, effectiveCompany?.id);

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.activeTab || "panoramica";
      }
    } catch {}
    return "panoramica";
  });

  const [tabs, setTabs] = useState<TabConfig[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tabs) return parsed.tabs;
      }
    } catch {}
    return DEFAULT_TABS;
  });

  const persist = useCallback((newActiveTab: DashboardTab, newTabs: TabConfig[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ activeTab: newActiveTab, tabs: newTabs }));
    } catch {}
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
