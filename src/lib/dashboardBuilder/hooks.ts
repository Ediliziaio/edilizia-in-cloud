/**
 * Dashboard Builder — React Query hooks
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cloneTemplateToCo,
  fetchMetricCatalog,
  getDashboard,
  getMyCruscottoDashboard,
  getMetric,
  listCompanyRoleDashboards,
  listDashboardTemplates,
  listDashboards,
  resolveDashboard,
  saveDashboard,
  setCompanyRoleDashboard,
  unsetCompanyRoleDashboard,
} from "./api";
import type {
  Aggregation,
  AppRole,
  BreakdownDim,
  DashboardLayout,
  WidgetFilter,
} from "./types";

const KEYS = {
  all: ["dashboard-builder"] as const,
  catalog: ["dashboard-builder", "catalog"] as const,
  list: ["dashboard-builder", "list"] as const,
  one: (id: string) => ["dashboard-builder", "one", id] as const,
  resolve: (id: string, override?: WidgetFilter | null) =>
    ["dashboard-builder", "resolve", id, override ?? {}] as const,
  metric: (
    id: string,
    filters?: WidgetFilter,
    agg?: Aggregation | null,
    bd?: BreakdownDim,
  ) =>
    [
      "dashboard-builder",
      "metric",
      id,
      filters ?? {},
      agg ?? "default",
      bd ?? "none",
    ] as const,
} as const;

export function useMetricCatalog() {
  return useQuery({
    queryKey: KEYS.catalog,
    queryFn: fetchMetricCatalog,
    staleTime: 10 * 60 * 1000,
  });
}

export function useDashboards() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: listDashboards,
    staleTime: 30 * 1000,
  });
}

export function useDashboard(dashboardId: string | null | undefined) {
  return useQuery({
    queryKey: dashboardId ? KEYS.one(dashboardId) : ["dashboard-builder", "one", "none"],
    queryFn: () => getDashboard(dashboardId as string),
    enabled: !!dashboardId,
    staleTime: 30 * 1000,
  });
}

export function useResolveDashboard(
  dashboardId: string | null | undefined,
  overrideFilters?: WidgetFilter | null,
) {
  return useQuery({
    queryKey: dashboardId
      ? KEYS.resolve(dashboardId, overrideFilters)
      : ["dashboard-builder", "resolve", "none"],
    queryFn: () =>
      resolveDashboard({
        dashboardId: dashboardId as string,
        overrideFilters,
      }),
    enabled: !!dashboardId,
    staleTime: 15 * 1000,
  });
}

export function useMetric(args: {
  metricId: string | null;
  filters?: WidgetFilter;
  aggregation?: Aggregation | null;
  breakdown?: BreakdownDim;
  enabled?: boolean;
}) {
  const enabled = args.enabled !== false && !!args.metricId;
  return useQuery({
    queryKey: args.metricId
      ? KEYS.metric(args.metricId, args.filters, args.aggregation, args.breakdown)
      : ["dashboard-builder", "metric", "none"],
    queryFn: () =>
      getMetric({
        metricId: args.metricId as string,
        filters: args.filters,
        aggregation: args.aggregation,
        breakdown: args.breakdown,
      }),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useSaveDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      dashboardId?: string | null;
      name: string;
      description?: string | null;
      scope: "personal" | "company" | `role:${string}`;
      icon?: string | null;
      layout: DashboardLayout;
      note?: string | null;
    }) => saveDashboard(args),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.one(result.dashboard_id) });
      qc.invalidateQueries({
        queryKey: ["dashboard-builder", "resolve", result.dashboard_id],
      });
    },
  });
}

/**
 * Hook di convenienza: controlla se l'utente ha il flag
 * 'dashboard_builder_v1' abilitato per la sua company.
 */
export { useFeatureFlags as _useFeatureFlagsOrig } from "@/hooks/useFeatureFlags";

// ═══════════════════════════════════════════════════════════════
// Role-based cruscotto hooks (Sprint 5)
// ═══════════════════════════════════════════════════════════════

const ROLE_KEYS = {
  myCruscotto: ["role-cruscotto", "mine"] as const,
  roleMap: ["role-cruscotto", "map"] as const,
  templates: (role?: AppRole | null) =>
    ["role-cruscotto", "templates", role ?? "all"] as const,
} as const;

/** Ritorna il dashboard_id da mostrare all'utente corrente (basato sul suo ruolo). */
export function useMyCruscottoDashboard() {
  return useQuery({
    queryKey: ROLE_KEYS.myCruscotto,
    queryFn: getMyCruscottoDashboard,
    staleTime: 60 * 1000,
  });
}

/** Lista la mappa ruolo→dashboard per la company (solo admin). */
export function useCompanyRoleDashboards() {
  return useQuery({
    queryKey: ROLE_KEYS.roleMap,
    queryFn: listCompanyRoleDashboards,
    staleTime: 30 * 1000,
  });
}

/** Lista i template disponibili, opzionalmente filtrati per ruolo. */
export function useDashboardTemplates(role?: AppRole | null) {
  return useQuery({
    queryKey: ROLE_KEYS.templates(role),
    queryFn: () => listDashboardTemplates(role),
    staleTime: 5 * 60 * 1000,
  });
}

/** Imposta la dashboard per un ruolo (upsert). Invalida la mappa. */
export function useSetCompanyRoleDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ role, dashboardId }: { role: AppRole; dashboardId: string }) =>
      setCompanyRoleDashboard(role, dashboardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROLE_KEYS.roleMap });
      qc.invalidateQueries({ queryKey: ROLE_KEYS.myCruscotto });
    },
  });
}

/** Rimuove la mappatura per un ruolo. */
export function useUnsetCompanyRoleDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: AppRole) => unsetCompanyRoleDashboard(role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROLE_KEYS.roleMap });
      qc.invalidateQueries({ queryKey: ROLE_KEYS.myCruscotto });
    },
  });
}

/** Clona un template nella company e ritorna il nuovo dashboard_id. */
export function useCloneTemplateToCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      templateId: string;
      scope?: "personal" | "company" | `role:${string}`;
      name?: string | null;
    }) => cloneTemplateToCo(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: ROLE_KEYS.roleMap });
    },
  });
}
