import { useMemo, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, subMonths, format, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import type { DatePreset, CompanyDashboardFiltersState } from "@/components/dashboard/CompanyDashboardFilters";

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
    case "year":
      return { from: startOfYear(now), to: endOfDay(now) };
    case "custom":
      return { from: customFrom || subDays(now, 30), to: customTo || now };
  }
}

function calcRevenueAndMargin(orders: any[]) {
  let revenue = 0;
  let totalMarginPct = 0;
  let marginCount = 0;

  orders.forEach((o: any) => {
    const total = Number(o.total_amount) || 0;
    revenue += total;
    const articleCost = (o.order_items || []).reduce(
      (s: number, i: any) => s + (Number(i.purchase_price || 0) * Number(i.quantity || 1)), 0);
    const laborCost =
      (o.order_employees || []).reduce((s: number, e: any) => s + Number(e.total_cost || 0), 0) +
      (o.order_external_teams || []).reduce((s: number, t: any) => s + Number(t.total_cost || 0), 0);
    const totalCost = articleCost + laborCost;
    if (total > 0 && totalCost > 0) {
      totalMarginPct += ((total - totalCost) / total) * 100;
      marginCount++;
    }
  });

  return { revenue, margin: marginCount > 0 ? totalMarginPct / marginCount : 0 };
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

  const prevRange = useMemo(() => {
    const durationMs = dateRange.to.getTime() - dateRange.from.getTime();
    return {
      from: new Date(dateRange.from.getTime() - durationMs - 86400000),
      to: new Date(dateRange.from.getTime() - 1),
    };
  }, [dateRange]);

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ["dashboard-data", companyId, dateRange.from.toISOString(), dateRange.to.toISOString(), filters.statusId],
    queryFn: async () => {
      const now = new Date();
      const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const sevenDaysFromNow = new Date(now);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const todayStr = now.toISOString().split("T")[0];
      const thisMonthEndStr = thisMonthEnd.toISOString().split("T")[0];
      const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

      const dateFromStr = dateRange.from.toISOString();
      const dateToStr = dateRange.to.toISOString();
      const prevFromStr = prevRange.from.toISOString();
      const prevToStr = prevRange.to.toISOString();

      const ytdFromStr = startOfYear(now).toISOString();
      const ytdToStr = endOfDay(now).toISOString();

      const [
        ordersRes, customersRes, ticketsRes, ordersDataRes, pendingRevenueRes,
        urgentItemsRes, costsRes,
        prevOrdersRes, prevCustomersRes, prevTicketsRes,
        ordersThisMonthRes, ordersPrevMonthRes,
        supplierCostsDueRes, upcomingWorksRes,
        ordersYTDRes,
      ] = await Promise.all([
        (() => {
          let q: any = supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId!)
            .gte("created_at", dateFromStr).lte("created_at", dateToStr);
          if (filters.statusId) q = q.eq("status_id", filters.statusId);
          return q;
        })(),
        (() => {
          let q: any = supabase.from("orders").select("customer_id").eq("company_id", companyId!)
            .gte("created_at", dateFromStr).lte("created_at", dateToStr);
          if (filters.statusId) q = q.eq("status_id", filters.statusId);
          return q;
        })(),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId!).eq("status", "aperto"),
        (() => {
          let q: any = supabase.from("orders")
            .select(`id, description, total_amount, created_at,
              customer:profiles!orders_customer_id_fkey(first_name, last_name),
              status:order_statuses(name, color)`)
            .eq("company_id", companyId!)
            .gte("created_at", dateFromStr).lte("created_at", dateToStr);
          if (filters.statusId) q = q.eq("status_id", filters.statusId);
          return q.order("created_at", { ascending: false }).limit(5);
        })(),
        supabase.from("orders")
          .select("description, deposit_amount, deposit_paid, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_expected_date, balance_amount, balance_paid, balance_expected_date, financing_amount, financing_paid, financing_expected_date, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
          .eq("company_id", companyId!),
        supabase.from("order_items")
          .select(`id, name, status, order:orders!inner(id, order_code, work_start_date, expected_date, company_id, customer:profiles!orders_customer_id_fkey(first_name, last_name))`)
          .eq("order.company_id", companyId!)
          .neq("status", "installato")
          .neq("status", "in_magazzino"),
        supabase.from("company_costs").select("amount, due_date, is_paid").eq("company_id", companyId!).eq("is_paid", false),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("company_id", companyId!).gte("created_at", prevFromStr).lte("created_at", prevToStr),
        supabase.from("orders").select("customer_id").eq("company_id", companyId!).gte("created_at", prevFromStr).lte("created_at", prevToStr),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", companyId!).eq("status", "aperto"),
        supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!).gte("created_at", dateFromStr).lte("created_at", dateToStr),
        supabase.from("orders")
          .select("id, total_amount, order_items(purchase_price, quantity), order_employees(total_cost), order_external_teams(total_cost)")
          .eq("company_id", companyId!).gte("created_at", prevFromStr).lte("created_at", prevToStr),
        supabase.from("company_costs").select("name, amount, due_date").eq("company_id", companyId!).eq("is_paid", false)
          .gte("due_date", todayStr).lte("due_date", sevenDaysStr).order("due_date"),
        supabase.from("orders")
          .select("order_code, work_start_date, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
          .eq("company_id", companyId!).gte("work_start_date", todayStr).lte("work_start_date", sevenDaysStr).order("work_start_date"),
        supabase.from("orders")
          .select("id, total_amount, created_at")
          .eq("company_id", companyId!).gte("created_at", ytdFromStr).lte("created_at", ytdToStr),
      ]);

      // Stats
      const totalOrders = ordersRes.count || 0;
      const totalCustomers = new Set(customersRes.data?.map((o: any) => o.customer_id) || []).size;
      const openTickets = ticketsRes.count || 0;
      const prevOrdersCount = prevOrdersRes.count || 0;
      const prevCustomersCount = new Set(prevCustomersRes.data?.map((o: any) => o.customer_id) || []).size;

      // Pending revenue + overdue
      let pendingRevenue = 0;
      let pendingOrdersCount = 0;
      let overduePayments = 0;
      let overdueCount = 0;
      const weeklyReceivables: WeeklyDeadlinesData["receivables"] = [];

      pendingRevenueRes.data?.forEach((order: any) => {
        let orderPending = 0;
        const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim();

        const checkPayment = (paid: boolean, amount: number, expectedDate: string | null) => {
          if (!paid && amount > 0) {
            orderPending += amount;
            if (expectedDate && expectedDate < todayStr) {
              overduePayments += amount;
              overdueCount++;
            }
            if (expectedDate && expectedDate >= todayStr && expectedDate <= sevenDaysStr) {
              const daysLeft = Math.ceil((new Date(expectedDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              weeklyReceivables.push({ orderDescription: order.description || "Ordine", customerName, amount, expectedDate, daysLeft: Math.max(0, daysLeft) });
            }
          }
        };

        checkPayment(order.deposit_paid, Number(order.deposit_amount), order.deposit_expected_date);
        checkPayment(order.deposit_2_paid, Number(order.deposit_2_amount), order.deposit_2_expected_date);
        checkPayment(order.balance_paid, Number(order.balance_amount), order.balance_expected_date);
        checkPayment(order.financing_paid, Number(order.financing_amount), order.financing_expected_date);

        if (orderPending > 0) {
          pendingRevenue += orderPending;
          pendingOrdersCount++;
        }
      });

      // Cash flow
      let thisMonthIncome = 0;
      let nextMonthTotal = 0;

      pendingRevenueRes.data?.forEach((order: any) => {
        const addIfInRange = (paid: boolean, amount: number, date: string | null) => {
          if (!paid && date) {
            const d = new Date(date);
            if (d <= thisMonthEnd) thisMonthIncome += Number(amount) || 0;
            else if (d <= nextMonthEnd) nextMonthTotal += Number(amount) || 0;
          }
        };
        addIfInRange(order.deposit_paid, order.deposit_amount, order.deposit_expected_date);
        addIfInRange(order.deposit_2_paid, order.deposit_2_amount, order.deposit_2_expected_date);
        addIfInRange(order.balance_paid, order.balance_amount, order.balance_expected_date);
        addIfInRange(order.financing_paid, order.financing_amount, order.financing_expected_date);
      });

      let unpaidCostsThisMonth = 0;
      costsRes.data?.forEach(cost => {
        if (cost.due_date && cost.due_date <= thisMonthEndStr) {
          unpaidCostsThisMonth += Number(cost.amount) || 0;
        }
      });

      // CEO Strip
      const thisMonthStats = calcRevenueAndMargin(ordersThisMonthRes.data || []);
      const prevMonthStats = calcRevenueAndMargin(ordersPrevMonthRes.data || []);

      // Urgent items
      const processedUrgentItems: UrgentItem[] = [];
      urgentItemsRes.data?.forEach((item: any) => {
        const expectedDate = item.order?.expected_date || item.order?.work_start_date;
        if (expectedDate) {
          const date = new Date(expectedDate);
          const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft >= 0 && daysLeft <= 7) {
            processedUrgentItems.push({
              id: item.id, name: item.name, orderCode: item.order.order_code,
              customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`, daysLeft,
            });
          }
        }
      });

      // Weekly deadlines
      const weeklySupplierPayments = (supplierCostsDueRes.data || []).map((c: any) => ({
        name: c.name, amount: Number(c.amount), dueDate: c.due_date,
        daysLeft: Math.max(0, Math.ceil((new Date(c.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      }));
      const weeklyUpcomingWorks = (upcomingWorksRes.data || []).map((o: any) => ({
        orderCode: o.order_code,
        customerName: `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim(),
        workDate: o.work_start_date,
        daysLeft: Math.max(0, Math.ceil((new Date(o.work_start_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      }));

      // Financial alerts
      const financialAlerts: FinancialAlert[] = [];
      if (overdueCount > 0) {
        financialAlerts.push({ type: "error", message: `${overdueCount} pagamenti scaduti per ${formatCurrency(overduePayments)}` });
      }
      if (unpaidCostsThisMonth > thisMonthIncome && unpaidCostsThisMonth > 0) {
        financialAlerts.push({ type: "warning", message: `Uscite previste (${formatCurrency(unpaidCostsThisMonth)}) superiori agli incassi (${formatCurrency(thisMonthIncome)}) questo mese` });
      }

      // Monthly Balance (last 6 months)
      const monthlyBalance: { month: string; entrate: number; uscite: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const ms = startOfMonth(subMonths(now, i));
        const me = endOfMonth(subMonths(now, i));
        const msStr = ms.toISOString().split("T")[0];
        const meStr = me.toISOString().split("T")[0];
        let entrate = 0;
        pendingRevenueRes.data?.forEach((order: any) => {
          const addIfInMonth = (paid: boolean, amount: number, date: string | null) => {
            if (!paid && date && date >= msStr && date <= meStr) entrate += Number(amount) || 0;
          };
          addIfInMonth(order.deposit_paid, order.deposit_amount, order.deposit_expected_date);
          addIfInMonth(order.deposit_2_paid, order.deposit_2_amount, order.deposit_2_expected_date);
          addIfInMonth(order.balance_paid, order.balance_amount, order.balance_expected_date);
          addIfInMonth(order.financing_paid, order.financing_amount, order.financing_expected_date);
        });
        let uscite = 0;
        costsRes.data?.forEach(cost => {
          if (cost.due_date && cost.due_date >= msStr && cost.due_date <= meStr) {
            uscite += Number(cost.amount) || 0;
          }
        });
        monthlyBalance.push({ month: format(ms, "MMM", { locale: it }), entrate, uscite });
      }

      // Revenue YTD
      const revenueYTD: { month: string; revenue: number }[] = [];
      const ytdStart = startOfYear(now);
      const currentMonth = now.getMonth();
      for (let m = 0; m <= currentMonth; m++) {
        const ms = new Date(now.getFullYear(), m, 1);
        const me = endOfMonth(ms);
        const msStr = ms.toISOString();
        const meStr = me.toISOString();
        let revenue = 0;
        (ordersYTDRes.data || []).forEach((o: any) => {
          const createdAt = o.created_at || "";
          if (createdAt >= msStr && createdAt <= meStr) revenue += Number(o.total_amount) || 0;
        });
        revenueYTD.push({ month: format(ms, "MMM", { locale: it }), revenue });
      }

      // Aging Receivables
      const agingReceivables = { overdue: 0, thisWeek: 0, thisMonth: 0, future: 0 };
      pendingRevenueRes.data?.forEach((order: any) => {
        const classifyPayment = (paid: boolean, amount: number, date: string | null) => {
          if (paid || !amount || amount <= 0) return;
          const amt = Number(amount) || 0;
          if (!date) { agingReceivables.future += amt; return; }
          if (date < todayStr) { agingReceivables.overdue += amt; return; }
          if (date <= sevenDaysStr) { agingReceivables.thisWeek += amt; return; }
          if (date <= thisMonthEndStr) { agingReceivables.thisMonth += amt; return; }
          agingReceivables.future += amt;
        };
        classifyPayment(order.deposit_paid, order.deposit_amount, order.deposit_expected_date);
        classifyPayment(order.deposit_2_paid, order.deposit_2_amount, order.deposit_2_expected_date);
        classifyPayment(order.balance_paid, order.balance_amount, order.balance_expected_date);
        classifyPayment(order.financing_paid, order.financing_amount, order.financing_expected_date);
      });

      return {
        stats: { totalOrders, totalCustomers, openTickets, pendingRevenue, pendingOrdersCount } as DashboardStats,
        prevStats: { totalOrders: prevOrdersCount, totalCustomers: prevCustomersCount } as PrevStats,
        recentOrders: (ordersDataRes.data as unknown as RecentOrder[]) || [],
        cashFlow: { thisMonthIncome, thisMonthOutflow: unpaidCostsThisMonth, netCashFlow: thisMonthIncome - unpaidCostsThisMonth, nextMonth: nextMonthTotal } as CashFlow,
        ceoStrip: {
          revenueThisMonth: thisMonthStats.revenue, revenuePrevMonth: prevMonthStats.revenue,
          marginThisMonth: thisMonthStats.margin, marginPrevMonth: prevMonthStats.margin,
          ordersThisMonth: (ordersThisMonthRes.data || []).length, ordersPrevMonth: (ordersPrevMonthRes.data || []).length,
        } as CeoStrip,
        urgentItems: processedUrgentItems.slice(0, 5),
        financialAlerts,
        weeklyDeadlines: { receivables: weeklyReceivables, companyCosts: weeklySupplierPayments, upcomingWorks: weeklyUpcomingWorks } as WeeklyDeadlinesData,
        monthlyBalance,
        revenueYTD,
        agingReceivables,
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
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
  };
}
