/**
 * CustomersList — types
 * Estratto da CustomersList.tsx (MP-CAN-001 Fase 2).
 */
import type { ComponentType } from "react";

export interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
}

export interface CustomerWithOrders {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  fiscal_code: string | null;
  address: string | null;
  site_address: string | null;
  notes: string | null;
  order_count: number;
  created_at: string;
  salesperson_id: string | null;
  portal_disabled?: boolean | null;
  // Estesi
  is_business?: boolean | null;
  business_name?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  site_city?: string | null;
  site_postal_code?: string | null;
  site_province?: string | null;
}

export interface PaginatedResult {
  rows: CustomerWithOrders[];
  total_count: number;
}

export interface CustomerStats {
  total: number;
  month_current: number;
  month_previous: number;
  with_orders: number;
  without_orders: number;
  portal_disabled: number;
}

export interface ResetPasswordResult {
  newPassword: string;
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export type SortField = "name" | "created_at" | "orders";
export type SortDir = "asc" | "desc";
export type YesNoAll = "all" | "yes" | "no";
export type PortalState = "all" | "active" | "disabled";
export type CustomerAnomalySeverity = "high" | "medium" | "low";

export interface CustomerAnomaly {
  severity: CustomerAnomalySeverity;
  label: string;
  action: string;
  icon: ComponentType<{ className?: string }>;
}
