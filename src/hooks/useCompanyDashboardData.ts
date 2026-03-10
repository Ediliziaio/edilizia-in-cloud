import { useMemo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfYear, endOfDay } from "date-fns";
import type { DatePreset, CompanyDashboardFiltersState } from "@/components/dashboard/CompanyDashboardFilters";
import { queryKeys } from "@/lib/queryKeys";
import { getDateRange } from "@/lib/dateRangeUtils";

export interface RecentOrder {
  id: string;
  description: string;
  total_amount: number;
  created_at: string;
  customer: { first_name: string; last_name: string };
  status: { name: string; color: string } | null;
}

export interface UrgentItem {
  id: string;
  name: string;
  orderCode: string | null;
  customerName: string;
  daysLeft: number;
}

export interface CashFlow {
  thisMonthIncome: number;
  thisMonthOutflow: number;
  netCashFlow: number;
  nextMonth: number;
}

export interface CeoStrip {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  marginThisMonth: number;
  marginPrevMonth: number;
  ordersThisMonth: number;
  ordersPrevMonth: number;
}

export interface WeeklyDeadlinesData {
  receivables: Array<{ orderDescription: string; customerName: string; amount: number; expectedDate: string; daysLeft: number }>;
  companyCosts: Array<{ name: string; amount: number; dueDate: string; daysLeft: number }>;
  upcomingWorks: Array<{ orderCode: string; customerName: string; workDate: string; daysLeft: number }>;
}

export interface FinancialAlert {
  type: "warning" | "error";
  message: string;
}

export interface DashboardStats {
  totalOrders: number;
  totalCustomers: number;
  openTickets: number;
  pendingRevenue: number;
  pendingOrdersCount: number;
}

export interface PrevStats {
  totalOrders: number;
  totalCustomers: number;
}

export function useCompanyDashboardData() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [filters, setFilters] = useState<CompanyDashboardFiltersState>({
    datePreset: "year",
    dateFrom: startOfYear(new Date()),
    dateTo: endOfDay(new Date()),
    statusId: null,
  });

  const updateFilters = useCallback((partial: Partial<CompanyDashboardFiltersState>) => {
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

  const dateRange = useMemo(
    () => getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo),
    [filters.datePreset, filters.dateFrom, filters.dateTo]
  );

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: queryKeys.dashboard.company(companyId, `${dateRange.from.toISOString()}-${dateRange.to.toISOString()}-${filters.statusId}`),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_kpis", {
        p_company_id: companyId!,
        p_date_from: dateRange.from.toISOString(),
        p_date_to: dateRange.to.toISOString(),
        p_status_id: filters.statusId || undefined,
      });

      if (error) throw error;

      const result = data as any;

      return {
        stats: result.stats as DashboardStats,
        prevStats: result.prevStats as PrevStats,
        recentOrders: (result.recentOrders || []) as RecentOrder[],
        cashFlow: result.cashFlow as CashFlow,
        ceoStrip: result.ceoStrip as CeoStrip,
        urgentItems: (result.urgentItems || []) as UrgentItem[],
        financialAlerts: (result.financialAlerts || []) as FinancialAlert[],
        weeklyDeadlines: result.weeklyDeadlines as WeeklyDeadlinesData,
        monthlyBalance: (result.monthlyBalance || []) as { month: string; entrate: number; uscite: number }[],
        revenueYTD: (result.revenueYTD || []) as { month: string; revenue: number }[],
        agingReceivables: result.agingReceivables as { overdue: number; thisWeek: number; thisMonth: number; future: number },
      };
    },
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
  });

  return {
    companyId,
    filters,
    updateFilters,
    dashboardData,
    isLoading,
    isError,
    stats: dashboardData?.stats ?? { totalOrders: 0, totalCustomers: 0, openTickets: 0, pendingRevenue: 0, pendingOrdersCount: 0 },
    prevStats: dashboardData?.prevStats ?? { totalOrders: 0, totalCustomers: 0 },
    recentOrders: dashboardData?.recentOrders ?? [],
    cashFlow: dashboardData?.cashFlow ?? { thisMonthIncome: 0, thisMonthOutflow: 0, netCashFlow: 0, nextMonth: 0 },
    ceoStrip: dashboardData?.ceoStrip ?? { revenueThisMonth: 0, revenuePrevMonth: 0, marginThisMonth: 0, marginPrevMonth: 0, ordersThisMonth: 0, ordersPrevMonth: 0 },
    urgentItems: dashboardData?.urgentItems ?? [],
    financialAlerts: dashboardData?.financialAlerts ?? [],
    weeklyDeadlines: dashboardData?.weeklyDeadlines ?? { receivables: [], companyCosts: [], upcomingWorks: [] },
    monthlyBalance: dashboardData?.monthlyBalance ?? [],
    revenueYTD: dashboardData?.revenueYTD ?? [],
    agingReceivables: dashboardData?.agingReceivables ?? { overdue: 0, thisWeek: 0, thisMonth: 0, future: 0 },
  };
}
