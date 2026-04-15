/**
 * Dashboard Builder — Client API
 * Wrapper tipati sulle RPC Supabase per il frontend.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Aggregation,
  BreakdownDim,
  DashboardLayout,
  DashboardListItem,
  GetDashboardResult,
  MetricCatalogItem,
  MetricResult,
  ResolveDashboardResult,
  SaveDashboardResult,
  WidgetFilter,
} from "./types";

// ═══════════════════════════════════════════════════════════════
// Catalog (read-only)
// ═══════════════════════════════════════════════════════════════

export async function fetchMetricCatalog(): Promise<MetricCatalogItem[]> {
  const { data, error } = await supabase
    .from("metric_catalog")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("name");
  if (error) throw error;
  return (data as unknown as MetricCatalogItem[]) ?? [];
}

// ═══════════════════════════════════════════════════════════════
// Single metric
// ═══════════════════════════════════════════════════════════════

export async function getMetric(args: {
  metricId: string;
  filters?: WidgetFilter;
  aggregation?: Aggregation | null;
  breakdown?: BreakdownDim;
}): Promise<MetricResult> {
  const { data, error } = await supabase.rpc("get_metric" as never, {
    p_metric_id: args.metricId,
    p_filters: (args.filters ?? {}) as never,
    p_aggregation: (args.aggregation ?? null) as never,
    p_breakdown: (args.breakdown ?? "none") as never,
  } as never);
  if (error) throw error;
  return data as unknown as MetricResult;
}

// ═══════════════════════════════════════════════════════════════
// Dashboards CRUD
// ═══════════════════════════════════════════════════════════════

export async function listDashboards(): Promise<DashboardListItem[]> {
  const { data, error } = await supabase.rpc("list_dashboards" as never);
  if (error) throw error;
  return (data as unknown as DashboardListItem[]) ?? [];
}

export async function getDashboard(
  dashboardId: string,
): Promise<GetDashboardResult> {
  const { data, error } = await supabase.rpc("get_dashboard" as never, {
    p_dashboard_id: dashboardId,
  } as never);
  if (error) throw error;
  return data as unknown as GetDashboardResult;
}

export async function saveDashboard(args: {
  dashboardId?: string | null;
  name: string;
  description?: string | null;
  scope: "personal" | "company" | `role:${string}`;
  icon?: string | null;
  layout: DashboardLayout;
  note?: string | null;
}): Promise<SaveDashboardResult> {
  const { data, error } = await supabase.rpc("save_dashboard" as never, {
    p_dashboard_id: args.dashboardId ?? null,
    p_name: args.name,
    p_description: args.description ?? null,
    p_scope: args.scope,
    p_icon: args.icon ?? null,
    p_layout: args.layout as never,
    p_note: args.note ?? null,
  } as never);
  if (error) throw error;
  return data as unknown as SaveDashboardResult;
}

// ═══════════════════════════════════════════════════════════════
// Batch resolver
// ═══════════════════════════════════════════════════════════════

export async function resolveDashboard(args: {
  dashboardId: string;
  overrideFilters?: WidgetFilter | null;
}): Promise<ResolveDashboardResult> {
  const { data, error } = await supabase.rpc("resolve_dashboard" as never, {
    p_dashboard_id: args.dashboardId,
    p_override_filters: (args.overrideFilters ?? null) as never,
  } as never);
  if (error) throw error;
  return data as unknown as ResolveDashboardResult;
}
