import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useCallback } from "react";
import { subDays, startOfDay, endOfDay, startOfMonth, format, addDays } from "date-fns";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";

export type CruscottoDatePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "quarter" | "custom";

export interface CruscottoFiltersState {
  datePreset: CruscottoDatePreset;
  dateFrom: Date;
  dateTo: Date;
  assignedUserIds: string[];
  sources: string[];
  pipelineId: string | null;
  statusId: string | null;
}

export interface OperationsData {
  activeOrders: number;
  lateOrders: number;
  openTickets: number;
  overduePayments: number;
  overdueAmount: number;
}

export interface FinanceData {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  marginThisMonth: number;
  marginPrevMonth: number;
  cashFlowNet: number;
  thisMonthIncome: number;
  thisMonthOutflow: number;
  pendingRevenue: number;
  supplierDebt: number;
}

export interface WeeklyAgendaData {
  incomingPayments: number;
  incomingPaymentsCount: number;
  dueCosts: number;
  dueCostsCount: number;
  deliveries: number;
  appointments: number;
}

export interface CompanyTargets {
  monthly_revenue_target: number | null;
  monthly_orders_target: number | null;
  alert_late_orders_threshold: number;
  alert_open_tickets_threshold: number;
  alert_margin_min_pct: number;
  alert_runway_days_warning: number;
}

/** Safe number: returns fallback if NaN/Infinity */
export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

function getDateRange(preset: CruscottoDatePreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "last7": return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
    case "last30": return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
    case "month": return { from: startOfMonth(now), to: endOfDay(now) };
    case "quarter": return { from: startOfDay(subDays(now, 90)), to: endOfDay(now) };
    case "custom": return { from: customFrom || subDays(now, 30), to: customTo || now };
  }
}

export function useCruscottoData() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const [filters, setFilters] = useState<CruscottoFiltersState>({
    datePreset: "last30",
    dateFrom: subDays(new Date(), 30),
    dateTo: new Date(),
    assignedUserIds: [],
    sources: [],
    pipelineId: null,
    statusId: null,
  });

  const dateRange = useMemo(() => getDateRange(filters.datePreset, filters.dateFrom, filters.dateTo), [filters.datePreset, filters.dateFrom, filters.dateTo]);

  // Marketing data from RPC
  const { data: marketingData, isLoading: marketingLoading, error: marketingError } = useQuery({
    queryKey: ["cruscotto-marketing", companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.assignedUserIds, filters.sources, filters.pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketing_dashboard_stats", {
        p_company_id: companyId!,
        p_date_from: dateRange.from.toISOString(),
        p_date_to: dateRange.to.toISOString(),
        p_assigned_user_ids: filters.assignedUserIds.length > 0 ? filters.assignedUserIds : null,
        p_sources: filters.sources.length > 0 ? filters.sources : null,
        p_pipeline_id: filters.pipelineId,
      });
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Shared installments query — filtered to next 30 days for upcoming payments
  const { data: paymentsData } = useQuery({
    queryKey: ["cruscotto-installments", companyId],
    queryFn: async () => {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");

      // Get ALL unpaid installments (for overdue + upcoming calculations)
      const { data, error } = await (supabase as any)
        .from("order_installments")
        .select("amount, is_paid, expected_date, order:orders!inner(company_id)")
        .eq("order.company_id", companyId!)
        .eq("is_paid", false);
      if (error) throw error;
      return data as { amount: number; is_paid: boolean; expected_date: string | null }[];
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Operations data (orders, tickets)
  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: ["cruscotto-operations", companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.statusId],
    queryFn: async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");

      let activeOrdersQuery = supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (filters.statusId) activeOrdersQuery = activeOrdersQuery.eq("current_status_id", filters.statusId);

      const [activeOrdersRes, lateOrdersRes, openTicketsRes] = await Promise.all([
        activeOrdersQuery,
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .lt("expected_date", todayStr)
          .is("work_end_date", null),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!).eq("status", "aperto"),
      ]);

      let overduePayments = 0;
      let overdueAmount = 0;
      paymentsData?.forEach((inst) => {
        const amount = safeNumber(inst.amount);
        if (amount > 0 && inst.expected_date && inst.expected_date < todayStr) {
          overduePayments++;
          overdueAmount += amount;
        }
      });

      return {
        activeOrders: activeOrdersRes.count || 0,
        lateOrders: lateOrdersRes.count || 0,
        openTickets: openTicketsRes.count || 0,
        overduePayments,
        overdueAmount,
      } as OperationsData;
    },
    enabled: !!companyId && paymentsData !== undefined,
    staleTime: 120_000,
  });

  // Finance data — BUG 2 FIX: weighted margin
  const { data: financeData, isLoading: financeLoading } = useQuery({
    queryKey: ["cruscotto-finance", companyId, dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const now = new Date();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const thisMonthEndStr = format(thisMonthEnd, "yyyy-MM-dd");
      const dateFromStr = dateRange.from.toISOString();
      const dateToStr = dateRange.to.toISOString();
      const durationMs = dateRange.to.getTime() - dateRange.from.getTime();
      const prevFromStr = new Date(dateRange.from.getTime() - durationMs - 86400000).toISOString();
      const prevToStr = new Date(dateRange.from.getTime() - 1).toISOString();

      const [currentOrdersRes, prevOrdersRes, costsRes] = await Promise.all([
        supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!)
          .gte("created_at", dateFromStr).lte("created_at", dateToStr),
        supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!)
          .gte("created_at", prevFromStr).lte("created_at", prevToStr),
        supabase.from("company_costs").select("amount, due_date, is_paid")
          .eq("company_id", companyId!).eq("is_paid", false),
      ]);

      // BUG 2 FIX: Weighted margin calculation
      const calc = (orders: any[]) => {
        let totalRevenue = 0;
        let totalCostAll = 0;

        orders.forEach((o: any) => {
          const revenue = safeNumber(o.total_amount);
          totalRevenue += revenue;

          const articleCost = (o.order_items || []).reduce(
            (s: number, i: any) => s + (safeNumber(i.purchase_price) * safeNumber(i.quantity, 1)), 0
          );
          const laborCost =
            (o.order_employees || []).reduce((s: number, e: any) => s + safeNumber(e.total_cost), 0) +
            (o.order_external_teams || []).reduce((s: number, e: any) => s + safeNumber(e.total_cost), 0);

          totalCostAll += articleCost + laborCost;
        });

        // Weighted margin: (total revenue - total costs) / total revenue
        const weightedMargin = totalRevenue > 0
          ? ((totalRevenue - totalCostAll) / totalRevenue) * 100
          : 0;

        // Clamp between -100% and +100%
        const margin = Math.min(100, Math.max(-100, safeNumber(weightedMargin)));

        return { revenue: totalRevenue, margin };
      };

      const curr = calc(currentOrdersRes.data || []);
      const prev = calc(prevOrdersRes.data || []);

      // BUG 3 FIX: Filter payments to this month end for income calculation
      let pendingRevenue = 0, thisMonthIncome = 0, supplierDebt = 0;
      paymentsData?.forEach((inst) => {
        const amount = safeNumber(inst.amount);
        if (amount > 0) {
          pendingRevenue += amount;
          if (inst.expected_date && inst.expected_date <= thisMonthEndStr) thisMonthIncome += amount;
        }
      });

      let unpaidCosts = 0;
      costsRes.data?.forEach(cost => {
        const amount = safeNumber(cost.amount);
        supplierDebt += amount;
        if (cost.due_date && cost.due_date <= thisMonthEndStr) unpaidCosts += amount;
      });

      return {
        revenueThisMonth: curr.revenue,
        revenuePrevMonth: prev.revenue,
        marginThisMonth: curr.margin,
        marginPrevMonth: prev.margin,
        cashFlowNet: safeNumber(thisMonthIncome - unpaidCosts),
        thisMonthIncome,
        thisMonthOutflow: unpaidCosts,
        pendingRevenue,
        supplierDebt,
      } as FinanceData;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Invoice stats from RPC
  const { data: invoiceStats } = useQuery({
    queryKey: ["cruscotto-invoice-stats", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cruscotto_invoice_stats" as any, {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data as {
        total_outstanding: number;
        overdue_count: number;
        overdue_amount: number;
        due_this_week_count: number;
        due_this_week_amount: number;
        paid_this_month: number;
        issued_this_month: number;
        issued_this_month_amount: number;
      } | null;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Company targets/thresholds
  const { data: companyTargets } = useQuery({
    queryKey: ["cruscotto-targets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("monthly_revenue_target, monthly_orders_target, alert_late_orders_threshold, alert_open_tickets_threshold, alert_margin_min_pct, alert_runway_days_warning")
        .eq("id", companyId!)
        .single();
      if (error) throw error;
      return data as CompanyTargets;
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  // Weekly agenda data (next 7 days)
  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ["cruscotto-weekly", companyId, paymentsData],
    queryFn: async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const weekEnd = addDays(now, 7);
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      const [costsRes, deliveriesRes, appointmentsRes] = await Promise.all([
        supabase.from("company_costs").select("amount, due_date")
          .eq("company_id", companyId!).eq("is_paid", false)
          .gte("due_date", todayStr).lte("due_date", weekEndStr),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("expected_date", todayStr).lte("expected_date", weekEndStr)
          .is("work_end_date", null),
        supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("is_blocked_slot", false)
          .gte("appointment_date", todayStr).lte("appointment_date", weekEndStr),
      ]);

      let incomingPayments = 0, incomingPaymentsCount = 0;
      paymentsData?.forEach((inst) => {
        const amount = safeNumber(inst.amount);
        if (amount > 0 && inst.expected_date && inst.expected_date >= todayStr && inst.expected_date <= weekEndStr) {
          incomingPayments += amount;
          incomingPaymentsCount++;
        }
      });

      let dueCosts = 0;
      costsRes.data?.forEach(c => { dueCosts += safeNumber(c.amount); });

      return {
        incomingPayments,
        incomingPaymentsCount,
        dueCosts,
        dueCostsCount: costsRes.data?.length || 0,
        deliveries: deliveriesRes.count || 0,
        appointments: appointmentsRes.count || 0,
      } as WeeklyAgendaData;
    },
    enabled: !!companyId && paymentsData !== undefined,
    staleTime: 120_000,
  });

  const updateFilters = useCallback((partial: Partial<CruscottoFiltersState>) => {
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

  return {
    marketing: marketingData || null,
    operations: opsData || { activeOrders: 0, lateOrders: 0, openTickets: 0, overduePayments: 0, overdueAmount: 0 },
    finance: financeData || { revenueThisMonth: 0, revenuePrevMonth: 0, marginThisMonth: 0, marginPrevMonth: 0, cashFlowNet: 0, thisMonthIncome: 0, thisMonthOutflow: 0, pendingRevenue: 0, supplierDebt: 0 },
    weeklyAgenda: weeklyData || { incomingPayments: 0, incomingPaymentsCount: 0, dueCosts: 0, dueCostsCount: 0, deliveries: 0, appointments: 0 },
    invoiceStats: invoiceStats || null,
    companyTargets: companyTargets || null,
    isLoading: marketingLoading || opsLoading || financeLoading || weeklyLoading,
    error: marketingError as Error | null,
    filters,
    updateFilters,
  };
}
