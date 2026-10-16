import { isLateWork, scheduledMonthFlows, recordedMonthIncome, registeredCostAmount, upcomingWorkDeliveries } from "@/lib/cruscottoMetrics";
import { useCruscottoWorkOrders } from "@/hooks/useCruscottoWorkOrders";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useCallback } from "react";
import { subDays, format, addDays } from "date-fns";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { getDateRange } from "@/lib/dateRangeUtils";
import { safeNumber } from "@/lib/numberUtils";
import { queryKeys } from "@/lib/queryKeys";
import {
  calculateCruscottoInvoiceStats,
  CRUSCOTTO_INVOICE_DOCUMENT_TYPES,
  EMPTY_CRUSCOTTO_INVOICE_STATS,
  type CruscottoInvoiceStats,
  type CruscottoInvoiceStatsRow,
} from "@/lib/cruscottoInvoiceStats";

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
  completedOrders?: number;
  supportOrders?: number;
  totalOrders?: number;
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
  collectedThisMonth?: number | null;
  priorReceivables?: number;
  priorPayables?: number;
  collectedUndatedCount?: number;
  costsMissingVatCount?: number;
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
  revenueInRange: number;
  collectedInRange: number;
  costsPaidInRange: number;
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

interface OrderCostRow {
  total_amount: number | null;
  order_items?: Array<{ purchase_price: number | null; quantity: number | null }> | null;
  order_employees?: Array<{ total_cost: number | null }> | null;
  order_external_teams?: Array<{ total_cost: number | null }> | null;
}

interface AmountRow {
  amount: number | null;
}

type SupabaseQueryError = { message: string } | null | undefined;

function throwIfSupabaseError(...errors: SupabaseQueryError[]) {
  const error = errors.find(Boolean);
  if (error) throw error;
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
  const { data: paymentsData, isLoading: paymentsLoading, error: paymentsError } = useQuery({
    queryKey: queryKeys.cruscotto.installments(companyId),
    queryFn: async () => {
      return readAllOrderRows<InstallmentRow>((from, to) => supabase
        .from("order_installments")
        .select("id, amount, is_paid, expected_date, order:orders!inner(company_id)")
        .eq("order.company_id", companyId!).eq("is_paid", false)
        .order("id").range(from, to));
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  const workQuery = useCruscottoWorkOrders(companyId);
  const { data: ticketCount = 0, isLoading: opsLoading, error: opsError } = useQuery({
    queryKey: [...queryKeys.cruscotto.operations(companyId, filters.statusId), "tickets-v2"],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("tickets").select("id", { count: "exact", head: true })
        .eq("company_id", companyId!).eq("status", "aperto");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const todayDate = format(new Date(), "yyyy-MM-dd");
  const nextMonth = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1), "yyyy-MM-dd");
  const collectionsQuery = useQuery({
    queryKey: ["cruscotto", "recorded-income-v1", companyId, monthStart, todayDate],
    enabled: !!companyId,
    staleTime: 120_000,
    queryFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const [rows, undated] = await Promise.all([readAllOrderRows<{amount: number; is_paid: boolean; paid_date: string | null}>((from, to) => supabase
        .from("order_installments").select("id, amount, is_paid, paid_date, order:orders!inner(company_id)")
        .eq("order.company_id", companyId!).eq("is_paid", true)
        .gte("paid_date", monthStart).lt("paid_date", nextMonth).lte("paid_date", todayDate).order("id").range(from, to)),
        supabase.from("order_installments").select("id, order:orders!inner(company_id)", { count: "exact", head: true })
          .eq("order.company_id", companyId!).eq("is_paid", true).is("paid_date", null),
      ]);
      if (undated.error) throw undated.error;
      return { amount: recordedMonthIncome(rows), undated: undated.count ?? 0 };
    },
  });

  // Merge ops + payments via useMemo (no waterfall)
  const opsData = useMemo<OperationsData>(() => {
    const open = (workQuery.data ?? []).filter(o => o.work_state === "open" && (!filters.statusId || o.current_status_id === filters.statusId));
    const base = { totalOrders: workQuery.data?.length ?? 0, completedOrders: (workQuery.data ?? []).filter(o => o.work_state === "completed").length, supportOrders: (workQuery.data ?? []).filter(o => o.work_state === "support").length, activeOrders: open.length, lateOrders: open.filter(o => isLateWork(o)).length, openTickets: ticketCount };
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
  }, [workQuery.data, ticketCount, filters.statusId, paymentsData]);

  // Finance data
  const { data: rawFinanceData, isLoading: financeLoading, error: financeError } = useQuery({
    queryKey: [...queryKeys.cruscotto.finance(companyId, dateRange.from.toISOString(), dateRange.to.toISOString()), "scheduled-month-v2"],
    queryFn: async () => {
      const dateFromStr = dateRange.from.toISOString();
      const dateToStr = dateRange.to.toISOString();
      const durationMs = dateRange.to.getTime() - dateRange.from.getTime();
      const prevFromStr = new Date(dateRange.from.getTime() - durationMs).toISOString();
      const prevToStr = new Date(dateRange.from.getTime() - 1).toISOString();

      const [currentOrdersRes, prevOrdersRes, costsRes] = await Promise.all([
        readAllOrderRows<OrderCostRow>((from, to) => supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gte("created_at", dateFromStr).lte("created_at", dateToStr)
          .order("id").range(from, to)),
        readAllOrderRows<OrderCostRow>((from, to) => supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gte("created_at", prevFromStr).lte("created_at", prevToStr)
          .order("id").range(from, to)),
        readAllOrderRows<{amount: number; due_date: string | null; is_paid: boolean; vat_rate: number | null}>((from, to) => supabase.from("company_costs").select("id, amount, due_date, is_paid, vat_rate")
          .eq("company_id", companyId!).eq("is_paid", false).order("id").range(from, to)),
      ]);

      const calc = (orders: OrderCostRow[]) => {
        let totalRevenue = 0;
        let totalCostAll = 0;
        orders.forEach((o) => {
          const revenue = safeNumber(o.total_amount);
          totalRevenue += revenue;
          const articleCost = (o.order_items || []).reduce(
            (s, i) => s + (safeNumber(i.purchase_price) * safeNumber(i.quantity, 1)), 0
          );
          const laborCost =
            (o.order_employees || []).reduce((s, e) => s + safeNumber(e.total_cost), 0) +
            (o.order_external_teams || []).reduce((s, e) => s + safeNumber(e.total_cost), 0);
          totalCostAll += articleCost + laborCost;
        });
        const weightedMargin = totalRevenue > 0
          ? ((totalRevenue - totalCostAll) / totalRevenue) * 100
          : 0;
        const margin = Math.min(100, Math.max(-100, safeNumber(weightedMargin)));
        return { revenue: totalRevenue, margin };
      };

      const curr = calc(currentOrdersRes);
      const prev = calc(prevOrdersRes);

      return {
        revenueThisMonth: curr.revenue,
        revenuePrevMonth: prev.revenue,
        marginThisMonth: curr.margin,
        marginPrevMonth: prev.margin,
        costs: costsRes,
        supplierDebt: costsRes.reduce((sum, cost) => sum + registeredCostAmount(cost), 0),
      };
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Financial history remains included even when a job is archived. Operational counts exclude it.
  const financeData = useMemo<FinanceData>(() => {
    const base = rawFinanceData;
    const flows = scheduledMonthFlows(paymentsData ?? [], base?.costs ?? []);
    return {
      revenueThisMonth: base?.revenueThisMonth ?? 0,
      revenuePrevMonth: base?.revenuePrevMonth ?? 0,
      marginThisMonth: base?.marginThisMonth ?? 0,
      marginPrevMonth: base?.marginPrevMonth ?? 0,
      cashFlowNet: flows.net,
      thisMonthIncome: flows.incoming,
      thisMonthOutflow: flows.outgoing,
      costsMissingVatCount: (base?.costs ?? []).filter(c => c.vat_rate == null).length,
      collectedUndatedCount: collectionsQuery.data?.undated ?? 0,
      priorReceivables: flows.priorReceivables,
      priorPayables: flows.priorPayables,
      collectedThisMonth: collectionsQuery.data?.amount ?? null,
      pendingRevenue: (paymentsData ?? []).reduce((sum, row) => sum + Math.max(0, safeNumber(row.amount)), 0),
      supplierDebt: base?.supplierDebt ?? 0,
    };
  }, [rawFinanceData, paymentsData, collectionsQuery.data]);

  // Invoice stats from RPC
  const { data: invoiceStats, error: invoiceStatsError } = useQuery({
    queryKey: queryKeys.cruscotto.invoiceStats(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cruscotto_invoice_stats" as never, {
        p_company_id: companyId!,
      } as never);
      if (!error) return (data as CruscottoInvoiceStats | null) ?? EMPTY_CRUSCOTTO_INVOICE_STATS;

      const { data: fallbackData, error: fallbackError } = await supabase
        .from("invoices")
        .select("document_type, status, issue_date, due_date, total, paid_amount, updated_at, deleted_at")
        .eq("company_id", companyId!)
        .in("document_type", [...CRUSCOTTO_INVOICE_DOCUMENT_TYPES])
        .is("deleted_at", null)
        .limit(5000);

      if (fallbackError) throw fallbackError;
      return calculateCruscottoInvoiceStats((fallbackData ?? []) as CruscottoInvoiceStatsRow[]);
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Company targets/thresholds
  const { data: companyTargets, error: targetsError } = useQuery({
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
  const { data: rawWeeklyData, isLoading: weeklyLoading, error: weeklyError } = useQuery({
    queryKey: [...queryKeys.cruscotto.weekly(companyId), "gross-costs-v2"],
    queryFn: async () => {
      const archivedIds = await loadArchivedOrderIds(companyId!);
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const weekEnd = addDays(now, 7);
      const weekEndStr = format(weekEnd, "yyyy-MM-dd");

      const [costsRes, appointmentsRes] = await Promise.all([
        supabase.from("company_costs").select("amount, due_date, vat_rate")
          .eq("company_id", companyId!).eq("is_paid", false)
          .gte("due_date", todayStr).lte("due_date", weekEndStr),
        excludeArchivedOrders(supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("is_blocked_slot", false)
          .gte("appointment_date", todayStr).lte("appointment_date", weekEndStr), archivedIds, "order_id"),
      ]);
      throwIfSupabaseError(costsRes.error, appointmentsRes.error);

      let dueCosts = 0;
      costsRes.data?.forEach(c => { dueCosts += registeredCostAmount(c); });

      return {
        dueCosts,
        dueCostsCount: costsRes.data?.length || 0,
        deliveries: 0,
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

    return { ...base, deliveries: upcomingWorkDeliveries(workQuery.data ?? [], todayStr, weekEndStr), incomingPayments, incomingPaymentsCount };
  }, [rawWeeklyData, paymentsData, workQuery.data]);

  // Today focus filter state (separate from main filters)
  const [todayDateFrom, setTodayDateFrom] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [todayDateTo, setTodayDateTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const updateTodayDateRange = useCallback((from: string, to: string) => {
    setTodayDateFrom(from);
    setTodayDateTo(to);
  }, []);

  // Today data — parameterized by todayDateFrom/todayDateTo for leads & appointments
  const { data: todayData, isLoading: todayLoading, error: todayError } = useQuery<TodayData>({
    queryKey: [...queryKeys.cruscotto.today(companyId, todayDateFrom, todayDateTo), "financial-history-v2"],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const archivedIds = await loadArchivedOrderIds(companyId!);
      const nowStr = format(new Date(), "yyyy-MM-dd");
      const in7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

      const [leadsRes, appointmentsRes, overdueRes, suppliersRes, revenueRes, collectedRes, costsPaidRes] = await Promise.all([
        supabase.from("marketing_contacts").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("created_at", `${todayDateFrom}T00:00:00`)
          .lte("created_at", `${todayDateTo}T23:59:59`),
        excludeArchivedOrders(supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("appointment_date", todayDateFrom)
          .lte("appointment_date", todayDateTo)
          .eq("is_blocked_slot", false), archivedIds, "order_id"),
        supabase.from("order_installments")
          .select("id, amount, expected_date, order:orders!inner(company_id)")
          .eq("order.company_id", companyId!)
          .eq("is_paid", false)
          .lt("expected_date", nowStr)
          .limit(5000),
        supabase.from("company_costs")
          .select("id, name, amount, due_date, category, vat_rate")
          .eq("company_id", companyId!)
          .eq("is_paid", false)
          .gte("due_date", nowStr)
          .lte("due_date", in7Days)
          .order("due_date", { ascending: true }),
        // Revenue: orders created in range
        supabase.from("orders")
          .select("total_amount")
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .gte("created_at", `${todayDateFrom}T00:00:00`)
          .lte("created_at", `${todayDateTo}T23:59:59`),
        // Collected: installments paid in range
        supabase.from("order_installments")
          .select("amount, order:orders!inner(company_id)")
          .eq("order.company_id", companyId!)
          .eq("is_paid", true)
          .gte("paid_date", todayDateFrom)
          .lte("paid_date", todayDateTo),
        // Costs paid in range
        supabase.from("company_costs")
          .select("amount, vat_rate")
          .eq("company_id", companyId!)
          .eq("is_paid", true)
          .gte("paid_date", todayDateFrom)
          .lte("paid_date", todayDateTo),
      ]);
      throwIfSupabaseError(
        leadsRes.error,
        appointmentsRes.error,
        overdueRes.error,
        suppliersRes.error,
        revenueRes.error,
        collectedRes.error,
        costsPaidRes.error,
      );

      const overdueCount = overdueRes.data?.length ?? 0;
      const overdueAmount = ((overdueRes.data ?? []) as AmountRow[]).reduce((s, r) => s + safeNumber(r.amount), 0);
      const suppliersDue = (suppliersRes.data ?? []).map(row => ({ ...row, amount: registeredCostAmount(row) }));
      const suppliersDueAmount = suppliersDue.reduce((s, c) => s + safeNumber(c.amount), 0);

      const revenueInRange = ((revenueRes.data ?? []) as Array<{ total_amount: number | null }>).reduce((s, r) => s + safeNumber(r.total_amount), 0);
      const collectedInRange = ((collectedRes.data ?? []) as AmountRow[]).reduce((s, r) => s + safeNumber(r.amount), 0);
      const costsPaidInRange = (costsPaidRes.data ?? []).reduce((s, r) => s + registeredCostAmount(r), 0);

      return {
        leadsToday: leadsRes.count ?? 0,
        appointmentsToday: appointmentsRes.count ?? 0,
        overdueAmount,
        overdueCount,
        suppliersDueAmount,
        suppliersDue,
        revenueInRange,
        collectedInRange,
        costsPaidInRange,
      };
    },
  });

  // Cash flow forecast + revenue by period
  const { data: cashFlowForecast, isLoading: forecastLoading, error: forecastError } = useQuery<CashFlowForecastData>({
    queryKey: queryKeys.cruscotto.cashFlowForecast(companyId),
    enabled: !!companyId,
    staleTime: 300_000,
    queryFn: async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const in30 = format(addDays(now, 30), "yyyy-MM-dd");
      const in60 = format(addDays(now, 60), "yyyy-MM-dd");
      const in90 = format(addDays(now, 90), "yyyy-MM-dd");

      const { data: futureInstallments, error: futureInstallmentsError } = await supabase
        .from("order_installments")
        .select("amount, expected_date, order:orders!inner(company_id)")
        .eq("order.company_id", companyId!)
        .is("order.deleted_at", null)
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

      throwIfSupabaseError(futureInstallmentsError);

      const [ytdOrdersRes, monthOrdersRes, qOrdersRes] = await Promise.all([
        supabase.from("orders").select("total_amount").eq("company_id", companyId!).is("deleted_at", null).gte("created_at", yearStart).limit(5000),
        supabase.from("orders").select("total_amount").eq("company_id", companyId!).is("deleted_at", null).gte("created_at", monthStart).limit(5000),
        supabase.from("orders").select("total_amount").eq("company_id", companyId!).is("deleted_at", null).gte("created_at", quarterStart).limit(5000),
      ]);
      throwIfSupabaseError(ytdOrdersRes.error, monthOrdersRes.error, qOrdersRes.error);

      const sum = (rows: Array<{ total_amount?: number }> | null) =>
        (rows ?? []).reduce((s, r) => s + safeNumber(r.total_amount), 0);

      return {
        incoming30,
        incoming60,
        incoming90,
        ytdRevenue: sum(ytdOrdersRes.data),
        monthRevenue: sum(monthOrdersRes.data),
        quarterRevenue: sum(qOrdersRes.data),
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

  const firstError =
    workQuery.error ||
    collectionsQuery.error ||
    marketingError ||
    paymentsError ||
    opsError ||
    financeError ||
    invoiceStatsError ||
    targetsError ||
    weeklyError ||
    todayError ||
    forecastError ||
    null;

  return {
    marketing: marketingData || null,
    operations: opsData,
    workOrders: workQuery.data ?? [],
    finance: financeData,
    financeError: financeError || paymentsError || collectionsQuery.error,
    operationsError: workQuery.error || opsError || paymentsError,
    todayError,
    weeklyAgenda,
    invoiceStats: invoiceStats || null,
    companyTargets: companyTargets || null,
    todayData: todayData ?? null,
    cashFlowForecast: cashFlowForecast ?? null,
    todayDateFrom,
    todayDateTo,
    updateTodayDateRange,
    isLoading: paymentsLoading || collectionsQuery.isLoading || workQuery.isLoading || marketingLoading || opsLoading || financeLoading || weeklyLoading || todayLoading || forecastLoading,
    error: firstError as Error | null,
    filters,
    updateFilters,
  };
}
