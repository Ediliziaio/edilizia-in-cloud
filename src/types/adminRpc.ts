// ─── Tipi di ritorno delle RPC Supabase (area admin) ────────────────────────

export interface CompanyOrderStats {
  company_id: string;
  order_count: number;
  total_value: number;
  last_order_date: string | null;
}

export interface CompanyUserCount {
  company_id: string;
  user_count: number;
}

export interface CompanyHealthData {
  company_id: string;
  order_count: number;
  orders_last_30d: number;
  user_count: number;
  has_customers: boolean;
  has_staff: boolean;
  last_order_date: string | null;
}

export interface CompanyLastAccess {
  company_id: string;
  last_access: string | null;
}

export interface PlanCompanyCount {
  subscription_plan_id: string;
  company_count: number;
}

export interface TotalOrdersValue {
  total_count: number;
  total_value: number;
}
