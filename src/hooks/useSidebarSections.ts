import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { internalNavItems, marketingNavItems } from "@/lib/sidebarConfig";

const STORAGE_KEY = "sidebar_sections_state";

const DEFAULT_STATE: Record<string, boolean> = {
  mkt_crm: false,
  mkt_comunicazione: false,
  mkt_automation: false,
  mkt_analisi: false,
  gi_operazioni: false,
  gi_supporto: false,
  gi_finanza: false,
  gi_team: false,
  gi_automation: false,
};

// Build route → subcategory map from nav items
const ROUTE_TO_SECTION: Record<string, string> = {};
[...internalNavItems, ...marketingNavItems].forEach((item) => {
  if (item.subcategory) {
    ROUTE_TO_SECTION[item.url] = item.subcategory;
  }
});

function loadState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_STATE, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_STATE };
}

function saveState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function findActiveSection(pathname: string): string | undefined {
  // Try exact match first, then prefix match (longest first)
  if (ROUTE_TO_SECTION[pathname]) return ROUTE_TO_SECTION[pathname];
  
  const sorted = Object.keys(ROUTE_TO_SECTION).sort((a, b) => b.length - a.length);
  for (const route of sorted) {
    if (pathname.startsWith(route + "/") || pathname === route) {
      return ROUTE_TO_SECTION[route];
    }
  }
  return undefined;
}

export function useSidebarSections() {
  const location = useLocation();

  const [sections, setSections] = useState<Record<string, boolean>>(() => {
    const state = loadState();
    const active = findActiveSection(location.pathname);
    if (active) state[active] = true;
    return state;
  });

  // Auto-expand on route change
  useEffect(() => {
    const active = findActiveSection(location.pathname);
    if (active && !sections[active]) {
      setSections((prev) => {
        const next = { ...prev, [active]: true };
        saveState(next);
        return next;
      });
    }
  }, [location.pathname]);

  const toggle = useCallback((sectionId: string) => {
    setSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveState(next);
      return next;
    });
  }, []);

  const isOpen = useCallback(
    (sectionId: string) => sections[sectionId] ?? true,
    [sections]
  );

  return { toggle, isOpen };
}
