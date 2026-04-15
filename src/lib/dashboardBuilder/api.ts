/**
 * Dashboard Builder — Client API
 * Wrapper tipati sulle RPC Supabase per il frontend.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Aggregation,
  AppRole,
  BreakdownDim,
  CompanyRoleDashboard,
  DashboardLayout,
  DashboardListItem,
  DashboardTemplate,
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

// ═══════════════════════════════════════════════════════════════
// Role-based cruscotto (Sprint 5)
// ═══════════════════════════════════════════════════════════════

/** Ritorna l'id della dashboard associata al ruolo dell'utente corrente. */
export async function getMyCruscottoDashboard(): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    "get_my_cruscotto_dashboard" as never,
  );
  if (error) throw error;
  return (data as unknown as string | null) ?? null;
}

/** Lista la mappa ruolo→dashboard per la company corrente (solo admin). */
export async function listCompanyRoleDashboards(): Promise<
  CompanyRoleDashboard[]
> {
  const { data, error } = await supabase.rpc(
    "list_company_role_dashboards" as never,
  );
  if (error) throw error;
  return (data as unknown as CompanyRoleDashboard[]) ?? [];
}

/** Imposta (upsert) la dashboard per un ruolo (solo admin). */
export async function setCompanyRoleDashboard(
  role: AppRole,
  dashboardId: string,
): Promise<void> {
  const { error } = await supabase.rpc(
    "set_company_role_dashboard" as never,
    { p_role: role, p_dashboard_id: dashboardId } as never,
  );
  if (error) throw error;
}

/** Rimuove la mappatura per un ruolo (solo admin). */
export async function unsetCompanyRoleDashboard(role: AppRole): Promise<void> {
  const { error } = await supabase.rpc(
    "unset_company_role_dashboard" as never,
    { p_role: role } as never,
  );
  if (error) throw error;
}

/** Lista i template disponibili, opzionalmente filtrati per ruolo. */
export async function listDashboardTemplates(
  role?: AppRole | null,
): Promise<DashboardTemplate[]> {
  const { data, error } = await supabase.rpc(
    "list_dashboard_templates" as never,
    { p_role: role ?? null } as never,
  );
  if (error) throw error;
  return (data as unknown as DashboardTemplate[]) ?? [];
}

/** Clona un template nella company corrente e ritorna il nuovo dashboard_id. */
export async function cloneTemplateToCo(args: {
  templateId: string;
  scope?: "personal" | "company" | `role:${string}`;
  name?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc(
    "clone_template_to_company" as never,
    {
      p_template_id: args.templateId,
      p_scope: args.scope ?? "personal",
      p_name: args.name ?? null,
    } as never,
  );
  if (error) throw error;
  return data as unknown as string;
}
