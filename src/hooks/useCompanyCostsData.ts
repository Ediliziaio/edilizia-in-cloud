import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addMonths, addDays, subMonths, startOfYear, endOfYear } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  buildOrderItemCosts,
  buildExternalTeamCosts,
  buildEmployeeCosts,
  buildCommissionCosts,
  buildDynamicCategories,
  buildMonthlyDistribution,
  sortCostsByPriority,
  buildCategoryDistribution,
  exportCostsToCSV,
  calculateBreakEven,
} from "@/lib/costsUtils";

export type { BreakEvenData } from "@/lib/costsUtils";

export type PeriodFilter = "this_month" | "next_month" | "last_3_months" | "this_year" | "all" | "custom";
export type StatusFilter = "all" | "unpaid" | "paid" | "overdue";
export type StatusTabFilter = "all" | "sostenuti" | "previsti" | "in_ritardo" | "in_scadenza";

export type { UnifiedCost } from "@/lib/costsUtils";

export interface CostsFilters {
  periodFilter: PeriodFilter;
  statusFilter: StatusFilter;
  searchQuery: string;
  supplierFilter: string;
  categoryFilter: string;
  originFilter: "all" | "manual" | "order";
  customDateRange?: { start: Date; end: Date } | null;
  statusTabFilter?: StatusTabFilter;
}

export function useCompanyCostsData(companyId: string | undefined, filters: CostsFilters, selectedYear?: number, dateFrom?: string, dateTo?: string) {
  const { periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter, customDateRange, statusTabFilter = "all" } = filters;
  const yearForStats = selectedYear ?? new Date().getFullYear();

  // Helper to get period date range
  const getPeriodRange = useMemo(() => {
    const now = new Date();
    if (periodFilter === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
    if (periodFilter === "next_month") return { start: startOfMonth(addMonths(now, 1)), end: endOfMonth(addMonths(now, 1)) };
    if (periodFilter === "last_3_months") return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    if (periodFilter === "this_year") return { start: startOfYear(now), end: endOfYear(now) };
    if (periodFilter === "custom" && customDateRange) return customDateRange;
    return null;
  }, [periodFilter, customDateRange]);

  // Query costs with supplier join
  const { data: costs = [], isLoading: isLoadingCosts } = useQuery({
    queryKey: [...queryKeys.costs.list(companyId), dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("company_costs")
        .select("*, order:orders(id, order_code), supplier:suppliers(id, name, product_category, vat_rate)")
        .eq("company_id", companyId!)
        .order("due_date", { ascending: true })
        .limit(1000);
      if (dateFrom) query = query.gte("due_date", dateFrom);
      if (dateTo) query = query.lte("due_date", dateTo);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query suppliers for the form
  const { data: suppliers = [], isLoading: isLoadingSuppliers } = useQuery({
    queryKey: queryKeys.costs.suppliers(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, product_category, vat_rate")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query ALL order items with supplier (for split payments)
  const { data: orderItemCosts = [], isLoading: isLoadingOrderItems } = useQuery({
    queryKey: queryKeys.costs.orderItems(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, purchase_price, status, payment_method, supplier_id, deposit_amount, deposit_paid, deposit_paid_date, balance_amount, balance_paid, balance_paid_date, balance_expected_date, is_paid, paid_date, supplier:suppliers(name, vat_rate), order:orders!inner(id, order_code, company_id)")
        .not("supplier_id", "is", null)
        .is("stock_item_id", null)
        .eq("order.company_id", companyId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query external teams from orders
  const { data: externalTeamCosts = [], isLoading: isLoadingExternalTeams } = useQuery({
    queryKey: queryKeys.costs.externalTeams(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("id, total_cost, payment_date, is_paid, paid_date, external_team:external_teams(name), order:orders!inner(id, order_code, company_id)")
        .eq("order.company_id", companyId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query all active employees for monthly salary costs
  const { data: activeEmployees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: queryKeys.costs.employees(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, gross_salary, is_active, created_at, inps_rate")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query commissions from orders
  const { data: commissionCosts = [], isLoading: isLoadingCommissions } = useQuery({
    queryKey: queryKeys.costs.commissions(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("id, commission_amount, is_paid, paid_date, payment_expected_date, salesperson:salespeople!inner(first_name, last_name, company_id), order:orders!inner(id, order_code, company_id)")
        .eq("salesperson.company_id", companyId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query orders for linking
  const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
    queryKey: queryKeys.costs.ordersForCosts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Transform raw data into unified cost format using extracted utilities
  const orderItemsAsVariableCosts = useMemo(() => buildOrderItemCosts(orderItemCosts), [orderItemCosts]);
  const externalTeamAsVariableCosts = useMemo(() => buildExternalTeamCosts(externalTeamCosts), [externalTeamCosts]);
  const employeeAsFixedCosts = useMemo(() => buildEmployeeCosts(activeEmployees), [activeEmployees]);
  const commissionAsVariableCosts = useMemo(() => buildCommissionCosts(commissionCosts), [commissionCosts]);

  // All order-derived costs combined
  const allOrderDerivedCosts = useMemo(() => [
    ...orderItemsAsVariableCosts,
    ...externalTeamAsVariableCosts,
    ...employeeAsFixedCosts,
    ...commissionAsVariableCosts,
  ], [orderItemsAsVariableCosts, externalTeamAsVariableCosts, employeeAsFixedCosts, commissionAsVariableCosts]);

  // Filtering logic for manual costs
  const filteredCosts = useMemo(() => {
    if (originFilter === "order") return [];
    const now = new Date();
    let filtered = costs as any[];

    if (getPeriodRange) {
      const { start, end } = getPeriodRange;
      filtered = filtered.filter((c: any) => {
        if (!c.due_date) return false;
        return isWithinInterval(new Date(c.due_date), { start, end });
      });
    }

    if (statusFilter === "paid") filtered = filtered.filter((c: any) => c.is_paid);
    else if (statusFilter === "unpaid") filtered = filtered.filter((c: any) => !c.is_paid && new Date(c.due_date) >= now);
    else if (statusFilter === "overdue") filtered = filtered.filter((c: any) => !c.is_paid && new Date(c.due_date) < now);

    if (supplierFilter !== "all") {
      if (supplierFilter === "none") filtered = filtered.filter((c: any) => !c.supplier_id);
      else filtered = filtered.filter((c: any) => c.supplier_id === supplierFilter);
    }

    if (categoryFilter !== "all") {
      if (categoryFilter === "none") filtered = filtered.filter((c: any) => !c.category);
      else filtered = filtered.filter((c: any) => c.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.supplier?.name || "").toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q) ||
        (c.order?.order_code || "").toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [costs, getPeriodRange, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter]);

  // Filtering logic for order-derived costs
  const filteredOrderItemCosts = useMemo(() => {
    if (originFilter === "manual") return [];
    const now = new Date();
    let filtered = allOrderDerivedCosts;
    if (getPeriodRange) {
      const { start, end } = getPeriodRange;
      filtered = filtered.filter(c => {
        if (!c.due_date) return false;
        return isWithinInterval(new Date(c.due_date), { start, end });
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.supplierName || "").toLowerCase().includes(q) ||
        (c.category || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q) ||
        (c.order?.order_code || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter === "paid") filtered = filtered.filter((c) => c.is_paid);
    else if (statusFilter === "unpaid") filtered = filtered.filter((c) => !c.is_paid && new Date(c.due_date) >= now);
    else if (statusFilter === "overdue") filtered = filtered.filter((c) => !c.is_paid && new Date(c.due_date) < now);
    if (supplierFilter !== "all") {
      if (supplierFilter === "none") filtered = filtered.filter((c) => !c.supplier_id && !c.supplierName);
      else filtered = filtered.filter((c) => c.supplier_id === supplierFilter);
    }
    if (categoryFilter !== "all") {
      if (categoryFilter === "none") filtered = filtered.filter((c) => !c.category);
      else filtered = filtered.filter((c) => c.category === categoryFilter);
    }
    return filtered;
  }, [allOrderDerivedCosts, getPeriodRange, searchQuery, statusFilter, supplierFilter, categoryFilter, originFilter]);

  // Query cost categories from dedicated table
  const { data: dbCategories = [] } = useQuery({
    queryKey: queryKeys.costs.categories(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("name")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return (data || []).map((c: any) => c.name as string);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const dynamicCategories = useMemo(() => buildDynamicCategories(dbCategories, costs as any[], suppliers as any[], allOrderDerivedCosts), [dbCategories, costs, suppliers, allOrderDerivedCosts]);

  const monthlyDistribution = useMemo(() => buildMonthlyDistribution(costs as any[], allOrderDerivedCosts), [costs, allOrderDerivedCosts]);

  // Cost name counts for group delete
  const costNameCounts = useMemo(() => {
    const map = new Map<string, number>();
    costs.forEach((c: any) => map.set(c.name, (map.get(c.name) || 0) + 1));
    return map;
  }, [costs]);

  // VAT calculations for stats
  const vatStats = useMemo(() => {
    let vatTotale = 0;
    let vatUnpaid = 0;
    let supplierUnpaid = 0;
    const allUnified = [...filteredCosts, ...filteredOrderItemCosts];
    allUnified.forEach((c: any) => {
      const rate = Number(c.vat_rate) || 0;
      const vatAmount = Number(c.amount) * (rate / 100);
      vatTotale += vatAmount;
      if (!c.is_paid) {
        vatUnpaid += vatAmount;
        if (c.supplier_id || c.supplierName || c.category === "Fornitori") {
          supplierUnpaid += Number(c.amount);
        }
      }
    });
    return { vatDebit: vatTotale, vatUnpaid, supplierUnpaid };
  }, [filteredCosts, filteredOrderItemCosts]);

  // Computed sorted/filtered lists
  const manualFixedCosts = filteredCosts.filter((c: any) => c.cost_type === "fixed");
  const manualVariableCosts = filteredCosts.filter((c: any) => c.cost_type === "variable");
  const orderDerivedFixed = filteredOrderItemCosts.filter((c) => c.cost_type === "fixed");
  const orderDerivedVariable = filteredOrderItemCosts.filter((c) => c.cost_type === "variable");
  const fixedCosts = [...manualFixedCosts, ...orderDerivedFixed];
  const variableCostsWithOrders = [...manualVariableCosts, ...orderDerivedVariable];

  const allCostsSorted = useMemo(() => sortCostsByPriority([...filteredCosts, ...filteredOrderItemCosts]), [filteredCosts, filteredOrderItemCosts]);

  // All costs unfiltered (for budget manager — not affected by active filters)
  const allCostsUnfiltered = useMemo(() =>
    sortCostsByPriority([...(costs as any[]), ...allOrderDerivedCosts]),
    [costs, allOrderDerivedCosts]
  );

  // Status tab pre-filtered lists
  const statusTabLists = useMemo(() => {
    const now = new Date();
    const soon = addDays(now, 7);
    const all = allCostsSorted;

    const sostenuti = all.filter(c => c.is_paid);
    const previsti = all.filter(c => !c.is_paid && c.due_date && new Date(c.due_date) > now);
    const inRitardo = all.filter(c => !c.is_paid && c.due_date && new Date(c.due_date) < now);
    const inScadenza = all.filter(c => {
      if (c.is_paid || !c.due_date) return false;
      const d = new Date(c.due_date);
      return d >= now && d <= soon;
    });

    return { sostenuti, previsti, inRitardo, inScadenza };
  }, [allCostsSorted]);

  // Apply status tab filter
  const statusTabFilteredCosts = useMemo(() => {
    switch (statusTabFilter) {
      case "sostenuti": return statusTabLists.sostenuti;
      case "previsti": return statusTabLists.previsti;
      case "in_ritardo": return statusTabLists.inRitardo;
      case "in_scadenza": return statusTabLists.inScadenza;
      default: return allCostsSorted;
    }
  }, [statusTabFilter, statusTabLists, allCostsSorted]);

  // Stats — reactive to active filters
  const stats = useMemo(() => {
    const now = new Date();
    const soon = addDays(now, 7);
    const allFiltered = [...filteredCosts, ...filteredOrderItemCosts] as any[];

    const unpaid = allFiltered.filter((c: any) => !c.is_paid);
    const paid = allFiltered.filter((c: any) => c.is_paid);
    const overdue = unpaid.filter((c: any) => c.due_date && new Date(c.due_date) < now);
    const expiringSoon = unpaid.filter((c: any) => {
      if (!c.due_date) return false;
      const d = new Date(c.due_date);
      return d >= now && d <= soon;
    });
    const previstiList = allFiltered.filter((c: any) => !c.is_paid && c.due_date && new Date(c.due_date) > now);

    const totalUnpaid = unpaid.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalPaid = paid.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalOverdue = overdue.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalExpiringSoon = expiringSoon.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalPrevisti = previstiList.reduce((s: number, c: any) => s + Number(c.amount), 0);

    // Scostamento: previsto vs sostenuto (positivo = risparmio)

    return {
      totalUnpaidThisMonth: totalUnpaid,
      totalPaidThisMonth: totalPaid,
      totalOverdue,
      unpaidCount: unpaid.length,
      paidCount: paid.length,
      overdueCount: overdue.length,
      expiringSoonCount: expiringSoon.length,
      totalExpiringSoon,
      totalPeriod: totalUnpaid + totalPaid,
      totalCount: allFiltered.length,
      totalPrevisti,
      previstiCount: previstiList.length,
      scostamento: totalPrevisti - totalPaid,
    };
  }, [filteredCosts, filteredOrderItemCosts]);

  // Yearly stats
  const yearlyStats = useMemo(() => {
    const yearStart = startOfYear(new Date(yearForStats, 0, 1));
    const yearEnd = endOfYear(new Date(yearForStats, 0, 1));
    const now = new Date();
    const allRaw = [...(costs as any[]), ...allOrderDerivedCosts];
    const yearCosts = allRaw.filter((c: any) => {
      if (!c.due_date) return false;
      const d = new Date(c.due_date);
      return d >= yearStart && d <= yearEnd;
    });
    const total = yearCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const paidItems = yearCosts.filter((c: any) => c.is_paid);
    const unpaidItems = yearCosts.filter((c: any) => !c.is_paid);
    const overdueItems = unpaidItems.filter((c: any) => c.due_date && new Date(c.due_date) < now);
    const totalPaid = paidItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalUnpaid = unpaidItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalOverdue = overdueItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const pctPaid = total > 0 ? Math.round((totalPaid / total) * 100) : 0;
    return { total, totalPaid, totalUnpaid, totalOverdue, pctPaid, count: yearCosts.length };
  }, [costs, allOrderDerivedCosts, yearForStats]);

  // CSV export — delegate to shared utility to avoid duplication
  const exportCostsCSV = () => exportCostsToCSV(filteredCosts, filteredOrderItemCosts);

  // Category distribution for PieChart
  const categoryDistribution = useMemo(() => buildCategoryDistribution(allCostsSorted), [allCostsSorted]);

  // Available years from costs data
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    (costs || []).forEach((c: any) => {
      const y = new Date(c.due_date).getFullYear();
      if (!isNaN(y)) yearsSet.add(y);
    });
    const now = new Date().getFullYear();
    yearsSet.add(now);
    yearsSet.add(now - 1);
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [costs]);

  // Fixed costs % trend (last 12 months)
  const fixedCostsTrend = useMemo(() => {
    const now = new Date();
    const monthsArr: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(now, i);
      monthsArr.push({
        key: format(startOfMonth(d), "yyyy-MM"),
        label: format(d, "MMM yy", { locale: it }),
      });
    }
    return monthsArr.map(({ key, label }) => {
      let fixed = 0;
      let variable = 0;
      (allCostsSorted || []).forEach((c: any) => {
        const cKey = format(new Date(c.due_date), "yyyy-MM");
        if (cKey !== key) return;
        if (c.cost_type === "fixed") fixed += Number(c.amount);
        else variable += Number(c.amount);
      });
      const total = fixed + variable;
      return { month: label, pctFixed: total > 0 ? Math.round((fixed / total) * 100) : 0 };
    });
  }, [allCostsSorted]);

  return {
    costs,
    suppliers,
    orders,
    allOrderDerivedCosts,
    filteredCosts,
    filteredOrderItemCosts,
    fixedCosts,
    variableCostsWithOrders,
    allCostsSorted,
    statusTabLists,
    statusTabFilteredCosts,
    dynamicCategories,
    monthlyDistribution,
    costNameCounts,
    vatStats,
    stats,
    yearlyStats,
    categoryDistribution,
    availableYears,
    fixedCostsTrend,
    isLoading: isLoadingCosts || isLoadingSuppliers || isLoadingOrders || isLoadingOrderItems ||
               isLoadingExternalTeams || isLoadingEmployees || isLoadingCommissions,
    exportCostsCSV,
    allCostsUnfiltered,
    breakEvenData: calculateBreakEven(fixedCosts, 0),
  };
}
