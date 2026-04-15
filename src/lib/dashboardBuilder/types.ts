/**
 * Dashboard Builder — TypeScript types
 * Shared between frontend and RPC responses.
 */

// ═══════════════════════════════════════════════════════════════
// Widget layout
// ═══════════════════════════════════════════════════════════════

export type WidgetType =
  | "kpi_card"
  | "chart_line"
  | "chart_bar"
  | "chart_pie"
  | "chart_area"
  | "table"
  | "progress"
  | "gauge"
  | "text_markdown"
  | "divider";

export type BreakdownDim =
  | "none"
  | "month"
  | "week"
  | "day"
  | "customer"
  | "order_status"
  | "payment_method"
  | "category"
  | "supplier"
  | "team"
  | "member"
  | "assigned_to"
  | "bucket"
  | "source";

export type Aggregation = "sum" | "avg" | "count" | "min" | "max" | "none";

export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_quarter"
  | "ytd"
  | "last_year"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "custom";

export interface WidgetFilter {
  period?: PeriodPreset;
  from?: string; // ISO date, used when period=custom
  to?: string;
  status_id?: string | null;
  customer_id?: string | null;
  [extra: string]: unknown;
}

export interface ColorRule {
  if: string; // expr-eval expression over { value, previous }
  color: string; // tailwind class or hex
  label?: string;
}

export interface WidgetConfig {
  metric?: string;
  aggregation?: Aggregation;
  breakdown?: BreakdownDim;
  filter?: WidgetFilter;
  compareTo?: "prev_period" | "prev_year" | "none";
  format?: {
    currency?: "EUR" | "USD";
    decimals?: number;
    prefix?: string;
    suffix?: string;
  };
  colorRules?: ColorRule[];
  title?: string;
  subtitle?: string;
  // Formula engine (campi calcolati)
  formula?: string; // es. "value / 1000"
  // Per widget testo
  markdown?: string;
  text?: string;
  // Per widget table
  columns?: Array<{ key: string; label: string; format?: string }>;
  // Per widget progress/gauge
  target?: number;
  min?: number;
  max?: number;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: WidgetConfig;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  globalFilters?: WidgetFilter;
}

// ═══════════════════════════════════════════════════════════════
// RPC response types
// ═══════════════════════════════════════════════════════════════

export interface MetricResultMeta {
  metric_id: string;
  aggregation: string;
  breakdown_dim: string;
  period_from: string | null;
  period_to: string | null;
  generated_at: string;
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
}

export interface MetricResult {
  value: number | null;
  breakdown: BreakdownRow[];
  meta: MetricResultMeta;
}

export interface DashboardListItem {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  icon: string | null;
  is_default: boolean;
  is_owner: boolean;
  can_edit: boolean;
  current_version: number | null;
  versions_count: number;
  updated_at: string;
  created_at: string;
}

export interface DashboardMeta {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  icon: string | null;
  is_default: boolean;
  owner_id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardVersionResult {
  version: number;
  layout: DashboardLayout;
  note: string | null;
  created_at: string | null;
}

export interface GetDashboardResult {
  dashboard: DashboardMeta;
  version: DashboardVersionResult;
  can_edit: boolean;
  versions_count: number;
}

export interface SaveDashboardResult {
  dashboard_id: string;
  version_id: string;
  version: number;
  is_current: true;
  created: boolean;
}

export type ResolvedWidgetStatus = "ok" | "error" | "skipped";

export interface ResolvedWidget {
  status: ResolvedWidgetStatus;
  value?: number | null;
  breakdown?: BreakdownRow[];
  meta?: MetricResultMeta;
  error?: string;
  metric?: string;
  reason?: string;
}

export interface ResolveDashboardResult {
  dashboard_id: string;
  version: number;
  resolved_at: string;
  widgets: Record<string, ResolvedWidget>;
  applied_filters: {
    global: WidgetFilter;
    override: WidgetFilter;
  };
}

export interface MetricCatalogItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  value_type: "currency" | "count" | "percent" | "duration" | "ratio";
  default_aggregation: Aggregation;
  allowed_aggregations: Aggregation[];
  allowed_dimensions: BreakdownDim[];
  requires_role: string | null;
  is_active: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Role-based cruscotto types (Sprint 5)
// ═══════════════════════════════════════════════════════════════

export type AppRole =
  | "super_admin"
  | "company_admin"
  | "company_staff"
  | "salesperson"
  | "call_center"
  | "employee";

export interface CompanyRoleDashboard {
  role: AppRole;
  dashboard_id: string;
  dashboard_name: string;
  updated_at: string;
  updated_by: string;
}

export interface DashboardTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  target_roles: AppRole[];
  category: string | null;
  icon: string | null;
  sort_order: number;
}
