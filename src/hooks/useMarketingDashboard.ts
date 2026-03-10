import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useState, useMemo, useCallback } from "react";
import { subDays, startOfMonth, startOfDay, endOfDay } from "date-fns";

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "custom";

export interface DashboardFiltersState {
  datePreset: DatePreset;
  dateFrom: Date;
  dateTo: Date;
  assignedUserIds: string[];
  sources: string[];
  pipelineId: string | null;
}

export interface KpiData {
  leads_total: number;
  leads_new: number;
  contacts_worked: number;
  appointments_set: number;
  appointments_done: number;
  show_rate: number;
  contracts_won: number;
  contracts_lost: number;
  revenue: number;
  revenue_lost: number;
  avg_ticket: number;
  close_rate: number;
  total_spend: number;
  cpl: number;
  cpa: number;
  calls_total: number;
  calls_answered: number;
  contact_rate: number;
  // Enterprise fields
  pipeline_active_value: number;
  avg_time_to_first_contact: number;
  avg_time_to_close: number;
  avg_lead_to_won_days: number;
  median_lead_to_won_days: number;
  sales_velocity: number;
  rpl: number;
  weighted_pipeline: number;
  lead_to_appointment_rate: number;
  appointment_to_contract_rate: number;
  lead_to_contract_rate: number;
  forecast_30d: number;
  forecast_min: number;
  forecast_max: number;
}

export interface FunnelStage {
  stage_id: string;
  name: string;
  position: number;
  count: number;
  total_value: number;
  avg_days_in_stage: number;
}

export interface SalesPerformance {
  user_id: string;
  name: string;
  appointments_set: number;
  appointments_done: number;
  contracts_won: number;
  revenue: number;
  show_rate: number;
}

export interface SourceAnalysis {
  source: string;
  leads: number;
  contracts_won: number;
  revenue: number;
  spend: number;
  roi_pct: number | null;
}

export interface CallCenterRow {
  user_id: string;
  name: string;
  calls_total: number;
  calls_answered: number;
  avg_duration_sec: number;
  appointments_set: number;
}

export interface AlertsData {
  stale_leads: number;
  stale_leads_2h: number;
  stale_opportunities: number;
  pending_appointments: number;
  show_rate_below_threshold: boolean;
  pipeline_declining: boolean;
}

export interface TrendPoint {
  day: string;
  leads: number;
  appointments: number;
  won: number;
}

export interface DashboardStats {
  kpi: KpiData;
  kpi_prev: KpiData;
  funnel: FunnelStage[];
  sales_performance: SalesPerformance[];
  sources: SourceAnalysis[];
  call_center: CallCenterRow[];
  alerts: AlertsData;
  trend: TrendPoint[];
}

function getDateRange(preset: DatePreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7":
      return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case "last30":
      return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "custom":
      return { from: customFrom || subDays(now, 30), to: customTo || now };
  }
}

export function useMarketingDashboard() {
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id;

  const [filters, setFilters] = useState<DashboardFiltersState>({
    datePreset: "last30",
    dateFrom: subDays(new Date(), 30),
    dateTo: new Date(),
    assignedUserIds: [],
    sources: [],
    pipelineId: null,
  });

  const dateRange = useMemo(() => getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo), [filters.datePreset, filters.dateFrom, filters.dateTo]);

  const effectiveAssignedIds = useMemo(() => {
    if (permissions.onlyAssigned && user?.id) {
      return [user.id];
    }
    return filters.assignedUserIds.length > 0 ? filters.assignedUserIds : null;
  }, [permissions.onlyAssigned, user?.id, filters.assignedUserIds]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["marketing-dashboard", companyId, dateRange.from.toISOString().slice(0,10), dateRange.to.toISOString().slice(0,10), effectiveAssignedIds, filters.sources, filters.pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketing_dashboard_stats", {
        p_company_id: companyId!,
        p_date_from: dateRange.from.toISOString(),
        p_date_to: dateRange.to.toISOString(),
        p_assigned_user_ids: effectiveAssignedIds,
        p_sources: filters.sources.length > 0 ? filters.sources : null,
        p_pipeline_id: filters.pipelineId,
      });
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const updateFilters = useCallback((partial: Partial<DashboardFiltersState>) => {
    setFilters(prev => {
      const next = { ...prev, ...partial };
      if (partial.datePreset && partial.datePreset !== "custom") {
        const range = getDateRange(partial.datePreset);
        next.dateFrom = range.from;
        next.dateTo = range.to;
      }
      return next;
    });
  }, []);

  return { data, isLoading, error, refetch, filters, updateFilters, permissions };
}
