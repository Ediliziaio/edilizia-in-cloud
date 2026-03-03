import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useCallback } from "react";
import { subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
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

  // Shared payments query (used by both operations and finance)
  const { data: paymentsData } = useQuery({
    queryKey: ["cruscotto-payments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("deposit_amount, deposit_paid, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_expected_date, balance_amount, balance_paid, balance_expected_date, financing_amount, financing_paid, financing_expected_date")
        .eq("company_id", companyId!)
        .or("deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false,financing_paid.eq.false");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Operations data (orders, tickets)
  const { data: opsData, isLoading: opsLoading } = useQuery({
    queryKey: ["cruscotto-operations", companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.statusId, paymentsData],
    queryFn: async () => {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];

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
      paymentsData?.forEach((order) => {
        const check = (paid: boolean, amount: number, date: string | null) => {
          if (!paid && amount > 0 && date && date < todayStr) {
            overduePayments++;
            overdueAmount += amount;
          }
        };
        check(order.deposit_paid, Number(order.deposit_amount), order.deposit_expected_date);
        check(order.deposit_2_paid, Number(order.deposit_2_amount), order.deposit_2_expected_date);
        check(order.balance_paid, Number(order.balance_amount), order.balance_expected_date);
        check(order.financing_paid, Number(order.financing_amount), order.financing_expected_date);
      });

      return {
        activeOrders: activeOrdersRes.count || 0,
        lateOrders: lateOrdersRes.count || 0,
        openTickets: openTicketsRes.count || 0,
        overduePayments,
        overdueAmount,
      } as OperationsData;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Finance data
  const { data: financeData, isLoading: financeLoading } = useQuery({
    queryKey: ["cruscotto-finance", companyId, dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const now = new Date();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const thisMonthEndStr = thisMonthEnd.toISOString().split("T")[0];
      const todayStr = now.toISOString().split("T")[0];
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
        let revenue = 0, totalMarginPct = 0, marginCount = 0;
        orders.forEach((o: any) => {
          const total = Number(o.total_amount) || 0;
          revenue += total;
          const articleCost = (o.order_items || []).reduce((s: number, i: any) => s + (Number(i.purchase_price || 0) * Number(i.quantity || 1)), 0);
          const laborCost = (o.order_employees || []).reduce((s: number, e: any) => s + Number(e.total_cost || 0), 0)
            + (o.order_external_teams || []).reduce((s: number, t: any) => s + Number(t.total_cost || 0), 0);
          const totalCost = articleCost + laborCost;
          if (total > 0 && totalCost > 0) { totalMarginPct += ((total - totalCost) / total) * 100; marginCount++; }
        });
        return { revenue, margin: marginCount > 0 ? totalMarginPct / marginCount : 0 };
      };

      const curr = calc(currentOrdersRes.data || []);
      const prev = calc(prevOrdersRes.data || []);

      let pendingRevenue = 0, thisMonthIncome = 0, supplierDebt = 0;
      paymentsData?.forEach((order) => {
        const addPending = (paid: boolean, amount: number, date: string | null) => {
          if (!paid && amount > 0) {
            pendingRevenue += amount;
            if (date && date <= thisMonthEndStr) thisMonthIncome += amount;
          }
        };
        addPending(order.deposit_paid, Number(order.deposit_amount), order.deposit_expected_date);
        addPending(order.deposit_2_paid, Number(order.deposit_2_amount), order.deposit_2_expected_date);
        addPending(order.balance_paid, Number(order.balance_amount), order.balance_expected_date);
        addPending(order.financing_paid, Number(order.financing_amount), order.financing_expected_date);
      });

      let unpaidCosts = 0;
      costsRes.data?.forEach(cost => {
        const amount = Number(cost.amount) || 0;
        supplierDebt += amount;
        if (cost.due_date && cost.due_date <= thisMonthEndStr) unpaidCosts += amount;
      });

      return {
        revenueThisMonth: curr.revenue,
        revenuePrevMonth: prev.revenue,
        marginThisMonth: curr.margin,
        marginPrevMonth: prev.margin,
        cashFlowNet: thisMonthIncome - unpaidCosts,
        thisMonthIncome,
        thisMonthOutflow: unpaidCosts,
        pendingRevenue,
        supplierDebt,
      } as FinanceData;
    },
    enabled: !!companyId,
    staleTime: 120_000,
  });

  // Weekly agenda data (next 7 days)
  const { data: weeklyData, isLoading: weeklyLoading } = useQuery({
    queryKey: ["cruscotto-weekly", companyId],
    queryFn: async () => {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const weekEnd = new Date(now.getTime() + 7 * 86400000);
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      const [paymentsRes, costsRes, deliveriesRes, appointmentsRes] = await Promise.all([
        // Incoming payments next 7 days
        supabase.from("orders")
          .select("deposit_amount, deposit_paid, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_expected_date, balance_amount, balance_paid, balance_expected_date, financing_amount, financing_paid, financing_expected_date")
          .eq("company_id", companyId!)
          .or("deposit_paid.eq.false,deposit_2_paid.eq.false,balance_paid.eq.false,financing_paid.eq.false"),
        // Costs due next 7 days
        supabase.from("company_costs").select("amount, due_date")
          .eq("company_id", companyId!).eq("is_paid", false)
          .gte("due_date", todayStr).lte("due_date", weekEndStr),
        // Deliveries next 7 days
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .gte("expected_date", todayStr).lte("expected_date", weekEndStr)
          .is("work_end_date", null),
        // Appointments next 7 days
        supabase.from("appointments").select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .eq("is_blocked_slot", false)
          .gte("appointment_date", todayStr).lte("appointment_date", weekEndStr),
      ]);

      let incomingPayments = 0, incomingPaymentsCount = 0;
      paymentsRes.data?.forEach(order => {
        const check = (paid: boolean, amount: number, date: string | null) => {
          if (!paid && amount > 0 && date && date >= todayStr && date <= weekEndStr) {
            incomingPayments += amount;
            incomingPaymentsCount++;
          }
        };
        check(order.deposit_paid, Number(order.deposit_amount), order.deposit_expected_date);
        check(order.deposit_2_paid, Number(order.deposit_2_amount), order.deposit_2_expected_date);
        check(order.balance_paid, Number(order.balance_amount), order.balance_expected_date);
        check(order.financing_paid, Number(order.financing_amount), order.financing_expected_date);
      });

      let dueCosts = 0;
      costsRes.data?.forEach(c => { dueCosts += Number(c.amount) || 0; });

      return {
        incomingPayments,
        incomingPaymentsCount,
        dueCosts,
        dueCostsCount: costsRes.data?.length || 0,
        deliveries: deliveriesRes.count || 0,
        appointments: appointmentsRes.count || 0,
      } as WeeklyAgendaData;
    },
    enabled: !!companyId,
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
    isLoading: marketingLoading || opsLoading || financeLoading || weeklyLoading,
    error: marketingError as Error | null,
    filters,
    updateFilters,
  };
}
