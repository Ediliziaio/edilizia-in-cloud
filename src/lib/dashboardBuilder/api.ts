/**
 * Dashboard Builder — Client API
 * Wrapper tipati sulle RPC Supabase per il frontend.
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  Aggregation,
  AppRole,
  BreakdownDim,
  CompanyMember,
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

export async function deleteDashboard(dashboardId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_dashboard" as never, {
    p_dashboard_id: dashboardId,
  } as never);
  if (error) throw error;
}

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

// ═══════════════════════════════════════════════════════════════
// User access + scope (Sprint 5.6)
// ═══════════════════════════════════════════════════════════════

/** Lista i membri della company dell'utente corrente.
 *  Usa una query diretta su `profiles` — la RLS policy
 *  "profiles_same_company_select" filtra automaticamente
 *  alla stessa azienda dell'utente autenticato.
 */
export async function listCompanyMembers(): Promise<CompanyMember[]> {
  // 1. Profili (stessa company via RLS)
  const { data: profiles, error: pErr } = await supabase
    .from("profiles" as never)
    .select("id, first_name, last_name, email")
    .order("first_name");
  if (pErr) throw pErr;
  if (!profiles || (profiles as unknown[]).length === 0) return [];

  const rows = profiles as Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  }>;
  const ids = rows.map((p) => p.id);

  // 2. Ruoli (il file SECURITY DEFINER è disponibile, ma come fallback usiamo
  //    una query diretta — se l'utente non ha accesso in lettura vedrà role=null)
  let roleMap: Record<string, AppRole> = {};
  try {
    const { data: roleRows } = await supabase
      .from("user_roles" as never)
      .select("user_id, role")
      .in("user_id" as never, ids);
    const PRIORITY: Record<string, number> = {
      super_admin: 1, company_admin: 2, company_staff: 3,
      salesperson: 4, call_center: 5, employee: 6,
    };
    for (const r of ((roleRows ?? []) as Array<{ user_id: string; role: AppRole }>)) {
      const prev = roleMap[r.user_id];
      if (!prev || (PRIORITY[r.role] ?? 99) < (PRIORITY[prev] ?? 99)) {
        roleMap[r.user_id] = r.role;
      }
    }
  } catch {
    // ruoli non disponibili — mostreremo solo nome e email
  }

  // 3. Restituisce solo utenti interni con ruolo app (esclude clienti=role null
  //    e operai=employee)
  const INTERNAL_ROLES: AppRole[] = [
    "super_admin",
    "company_admin",
    "company_staff",
    "salesperson",
    "call_center",
  ];

  return rows
    .map((p) => ({
      user_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      role: roleMap[p.id] ?? null,
    }))
    .filter((m) => m.role !== null && INTERNAL_ROLES.includes(m.role as AppRole));
}

/** Imposta una dashboard come default per l'utente corrente. */
export async function setDefaultDashboard(dashboardId: string): Promise<void> {
  const { error } = await supabase.rpc("set_default_dashboard" as never, {
    p_dashboard_id: dashboardId,
  } as never);
  if (error) throw error;
}

/** Cambia la visibilità (scope) di una dashboard. Solo il proprietario. */
export async function updateDashboardScope(
  dashboardId: string,
  scope: "personal" | "company",
): Promise<void> {
  const { error } = await supabase.rpc("update_dashboard_scope" as never, {
    p_dashboard_id: dashboardId,
    p_scope: scope,
  } as never);
  if (error) throw error;
}

/** Concede accesso individuale ad un utente su una dashboard. */
export async function setDashboardUserAccess(
  dashboardId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_dashboard_user_access" as never, {
    p_dashboard_id: dashboardId,
    p_user_id: userId,
  } as never);
  if (error) throw error;
}

/** Revoca l'accesso individuale di un utente ad una dashboard. */
export async function unsetDashboardUserAccess(
  dashboardId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc("unset_dashboard_user_access" as never, {
    p_dashboard_id: dashboardId,
    p_user_id: userId,
  } as never);
  if (error) throw error;
}
