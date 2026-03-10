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
function buildRouteMap(navItems: { url: string; subcategory?: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  navItems.forEach((item) => {
    if (item.subcategory) {
      map[item.url] = item.subcategory;
    }
  });
  return map;
}

const DEFAULT_ROUTE_MAP = buildRouteMap([...internalNavItems, ...marketingNavItems]);

function loadState(storageKey: string, defaults: Record<string, boolean>): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return { ...defaults, ...JSON.parse(stored) };
  } catch {}
  return { ...defaults };
}

function saveState(storageKey: string, state: Record<string, boolean>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {}
}

function findActiveSection(pathname: string, routeMap: Record<string, string>): string | undefined {
  if (routeMap[pathname]) return routeMap[pathname];
  
  const sorted = Object.keys(routeMap).sort((a, b) => b.length - a.length);
  for (const route of sorted) {
    if (pathname.startsWith(route + "/") || pathname === route) {
      return routeMap[route];
    }
  }
  return undefined;
}

interface UseSidebarSectionsOptions {
  navItems?: { url: string; subcategory?: string }[];
  storageKey?: string;
  defaultState?: Record<string, boolean>;
}

export function useSidebarSections(options?: UseSidebarSectionsOptions) {
  const location = useLocation();

  const storageKey = options?.storageKey ?? STORAGE_KEY;
  const defaults = options?.defaultState ?? DEFAULT_STATE;
  const routeMap = options?.navItems ? buildRouteMap(options.navItems) : DEFAULT_ROUTE_MAP;

  const [sections, setSections] = useState<Record<string, boolean>>(() => {
    const state = loadState(storageKey, defaults);
    const active = findActiveSection(location.pathname, routeMap);
    if (active) state[active] = true;
    return state;
  });

  // Auto-expand on route change
  useEffect(() => {
    const active = findActiveSection(location.pathname, routeMap);
    if (active && !sections[active]) {
      setSections((prev) => {
        const next = { ...prev, [active]: true };
        saveState(storageKey, next);
        return next;
      });
    }
  }, [location.pathname]);

  const toggle = useCallback((sectionId: string) => {
    setSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      saveState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const isOpen = useCallback(
    (sectionId: string) => sections[sectionId] ?? true,
    [sections]
  );

  return { toggle, isOpen };
}
