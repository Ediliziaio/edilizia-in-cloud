import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useCallback } from "react";
import { subDays, format, addDays } from "date-fns";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { getDateRange } from "@/lib/dateRangeUtils";
import { safeNumber } from "@/lib/numberUtils";
import { queryKeys } from "@/lib/queryKeys";

// Re-export for backward compatibility with existing consumers
export { safeNumber } from "@/lib/numberUtils";

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

export interface TodayData {
  leadsToday: number;
  appointmentsToday: number;
  overdueAmount: number;
  overdueCount: number;
  suppliersDueAmount: number;
  suppliersDue: Array<{ id: string; name: string; amount: number; due_date: string; category?: string }>;
}

export interface CashFlowForecastData {
  incoming30: number;
  incoming60: number;
  incoming90: number;
  monthRevenue: number;
  quarterRevenue: number;
  ytdRevenue: number;
}

export interface CompanyTargets {
  monthly_revenue_target: number | null;
  monthly_orders_target: number | null;
  alert_late_orders_threshold: number;
  alert_open_tickets_threshold: number;
  alert_margin_min_pct: number;
  alert_runway_days_warning: number;
}

interface InstallmentRow {
  amount: number;
  is_paid: boolean;
  expected_date: string | null;
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
    queryKey: queryKeys.cruscotto.marketing(companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.assignedUserIds, filters.sources, filters.pipelineId),
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

  // Installments — fires independently, no waterfall
  const { data: paymentsData } = useQuery({
    queryKey: queryKeys.cruscotto.installments(companyId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("order_installments")
        .select("amount, is_paid, expected_date, order:orders!inner(company_id)")
        .eq("order.company_id", companyId!)
        .eq("is_paid", false);
      if (error) throw error;
      return data as InstallmentRow[];
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Operations data — fires immediately, NO dependency on paymentsData
  const { data: rawOpsData, isLoading: opsLoading } = useQuery({
    queryKey: queryKeys.cruscotto.operations(companyId, filters.statusId),
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

      return {
        activeOrders: activeOrdersRes.count || 0,
        lateOrders: lateOrdersRes.count || 0,
        openTickets: openTicketsRes.count || 0,
      };
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Merge ops + payments via useMemo (no waterfall)
  const opsData = useMemo<OperationsData>(() => {
    const base = rawOpsData || { activeOrders: 0, lateOrders: 0, openTickets: 0 };
    const todayStr = format(new Date(), "yyyy-MM-dd");
    let overduePayments = 0;
    let overdueAmount = 0;
    paymentsData?.forEach((inst) => {
      const amount = safeNumber(inst.amount);
      if (amount > 0 && inst.expected_date && inst.expected_date < todayStr) {
        overduePayments++;
        overdueAmount += amount;
      }
    });
    return { ...base, overduePayments, overdueAmount };
  }, [rawOpsData, paymentsData]);

  // Finance data
  const { data: rawFinanceData, isLoading: financeLoading } = useQuery({
    queryKey: queryKeys.cruscotto.finance(companyId, dateRange.from.toISOString(), dateRange.to.toISOString()),
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
        const weightedMargin = totalRevenue > 0
          ? ((totalRevenue - totalCostAll) / totalRevenue) * 100
          : 0;
        const margin = Math.min(100, Math.max(-100, safeNumber(weightedMargin)));
        return { revenue: totalRevenue, margin };
      };

      const curr = calc(currentOrdersRes.data || []);
      const prev = calc(prevOrdersRes.data || []);

      let supplierDebt = 0;
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
        unpaidCosts,
        supplierDebt,
      };
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Merge finance + payments via useMemo
  const financeData = useMemo<FinanceData>(() => {
    const base = rawFinanceData || { revenueThisMonth: 0, revenuePrevMonth: 0, marginThisMonth: 0, marginPrevMonth: 0, unpaidCosts: 0, supplierDebt: 0 };
    const now = new Date();
    const thisMonthEndStr = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), "yyyy-MM-dd");

    let pendingRevenue = 0;
    let thisMonthIncome = 0;
    paymentsData?.forEach((inst) => {
      const amount = safeNumber(inst.amount);
      if (amount > 0) {
        pendingRevenue += amount;
        if (inst.expected_date && inst.expected_date <= thisMonthEndStr) thisMonthIncome += amount;
      }
    });

    return {
      revenueThisMonth: base.revenueThisMonth,
      revenuePrevMonth: base.revenuePrevMonth,
      marginThisMonth: base.marginThisMonth,
      marginPrevMonth: base.marginPrevMonth,
      cashFlowNet: safeNumber(thisMonthIncome - base.unpaidCosts),
      thisMonthIncome,
      thisMonthOutflow: base.unpaidCosts,
      pendingRevenue,
      supplierDebt: base.supplierDebt,
    };
  }, [rawFinanceData, paymentsData]);

  // Invoice stats from RPC
  const { data: invoiceStats } = useQuery({
    queryKey: queryKeys.cruscotto.invoiceStats(companyId),
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
    queryKey: queryKeys.cruscotto.targets(companyId),
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

  // Weekly agenda — fires immediately, NO dependency on paymentsData
  const { data: rawWeeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: queryKeys.cruscotto.weekly(companyId),
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

      let dueCosts = 0;
      costsRes.data?.forEach(c => { dueCosts += safeNumber(c.amount); });

      return {
        dueCosts,
        dueCostsCount: costsRes.data?.length || 0,
        deliveries: deliveriesRes.count || 0,
        appointments: appointmentsRes.count || 0,
      };
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Merge weekly + payments via useMemo
  const weeklyAgenda = useMemo<WeeklyAgendaData>(() => {
    const base = rawWeeklyData || { dueCosts: 0, dueCostsCount: 0, deliveries: 0, appointments: 0 };
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    const weekEndStr = format(addDays(now, 7), "yyyy-MM-dd");

    let incomingPayments = 0;
    let incomingPaymentsCount = 0;
    paymentsData?.forEach((inst) => {
      const amount = safeNumber(inst.amount);
      if (amount > 0 && inst.expected_date && inst.expected_date >= todayStr && inst.expected_date <= weekEndStr) {
        incomingPayments += amount;
        incomingPaymentsCount++;
      }
    });

    return { ...base, incomingPayments, incomingPaymentsCount };
  }, [rawWeeklyData, paymentsData]);

  // Today focus filter state (separate from main filters)
  const [todayDateFrom, setTodayDateFrom] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [todayDateTo, setTodayDateTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const updateTodayDateRange = useCallback((from: string, to: string) => {
    setTodayDateFrom(from);
    setTodayDateTo(to);
  }, []);

  // Today data — parameterized by todayDateFrom/todayDateTo for leads & appointments
  const { data: todayData, isLoading: todayLoading } = useQuery<TodayData>({
    queryKey: queryKeys.cruscotto.today(companyId, todayDateFrom, todayDateTo),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const nowStr = format(new Date(), "yyyy-MM-dd");
      const in7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

      const [leadsRes, appointmentsRes, overdueRes, suppliersRes] = await Promise.all([
        supabase.from("marketing_contacts").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("created_at", `${todayDateFrom}T00:00:00`)
          .lte("created_at", `${todayDateTo}T23:59:59`),
        supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("appointment_date", todayDateFrom)
          .lte("appointment_date", todayDateTo)
          .eq("is_blocked_slot", false),
        (supabase as any).from("order_installments")
          .select("id, amount, expected_date, order:orders!inner(company_id)")
          .eq("order.company_id", companyId!)
          .eq("is_paid", false)
          .lt("expected_date", nowStr),
        supabase.from("company_costs")
          .select("id, name, amount, due_date, category")
          .eq("company_id", companyId!)
          .eq("is_paid", false)
          .gte("due_date", nowStr)
          .lte("due_date", in7Days)
          .order("due_date", { ascending: true }),
      ]);

      const overdueCount = overdueRes.data?.length ?? 0;
      const overdueAmount = (overdueRes.data ?? []).reduce((s: number, r: any) => s + safeNumber(r.amount), 0);
      const suppliersDue = (suppliersRes.data ?? []) as Array<{ id: string; name: string; amount: number; due_date: string; category?: string }>;
      const suppliersDueAmount = suppliersDue.reduce((s, c) => s + safeNumber(c.amount), 0);

      return {
        leadsToday: leadsRes.count ?? 0,
        appointmentsToday: appointmentsRes.count ?? 0,
        overdueAmount,
        overdueCount,
        suppliersDueAmount,
        suppliersDue,
      };
    },
  });

  // Cash flow forecast + revenue by period
  const { data: cashFlowForecast, isLoading: forecastLoading } = useQuery<CashFlowForecastData>({
    queryKey: queryKeys.cruscotto.cashFlowForecast(companyId),
    enabled: !!companyId,
    staleTime: 300_000,
    queryFn: async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const in30 = format(addDays(now, 30), "yyyy-MM-dd");
      const in60 = format(addDays(now, 60), "yyyy-MM-dd");
      const in90 = format(addDays(now, 90), "yyyy-MM-dd");

      const { data: futureInstallments } = await (supabase as any)
        .from("order_installments")
        .select("amount, expected_date, order:orders!inner(company_id)")
        .eq("order.company_id", companyId!)
        .eq("is_paid", false)
        .gte("expected_date", todayStr)
        .lte("expected_date", in90);

      const all = (futureInstallments ?? []) as Array<{ amount: number; expected_date: string }>;
      const incoming30 = all.filter(i => i.expected_date <= in30).reduce((s, i) => s + safeNumber(i.amount), 0);
      const incoming60 = all.filter(i => i.expected_date <= in60).reduce((s, i) => s + safeNumber(i.amount), 0);
      const incoming90 = all.reduce((s, i) => s + safeNumber(i.amount), 0);

      const yearStart = `${now.getFullYear()}-01-01T00:00:00`;
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
      const quarter = Math.floor(now.getMonth() / 3);
      const quarterStart = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, "0")}-01T00:00:00`;

      const [{ data: ytdOrders }, { data: monthOrders }, { data: qOrders }] = await Promise.all([
        supabase.from("orders").select("total_amount").eq("company_id", companyId!).gte("created_at", yearStart),
        supabase.from("orders").select("total_amount").eq("company_id", companyId!).gte("created_at", monthStart),
        supabase.from("orders").select("total_amount").eq("company_id", companyId!).gte("created_at", quarterStart),
      ]);

      const sum = (rows: Array<{ total_amount?: number }> | null) =>
        (rows ?? []).reduce((s, r) => s + safeNumber(r.total_amount), 0);

      return {
        incoming30,
        incoming60,
        incoming90,
        ytdRevenue: sum(ytdOrders),
        monthRevenue: sum(monthOrders),
        quarterRevenue: sum(qOrders),
      };
    },
  });

  const updateFilters = useCallback((partial: Partial<CruscottoFiltersState>) => {
    setFilters((prev: CruscottoFiltersState) => {
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
    operations: opsData,
    finance: financeData,
    weeklyAgenda,
    invoiceStats: invoiceStats || null,
    companyTargets: companyTargets || null,
    todayData: todayData ?? null,
    cashFlowForecast: cashFlowForecast ?? null,
    todayDateFrom,
    todayDateTo,
    updateTodayDateRange,
    isLoading: marketingLoading || opsLoading || financeLoading || weeklyLoading || todayLoading || forecastLoading,
    error: marketingError as Error | null,
    filters,
    updateFilters,
  };
}
