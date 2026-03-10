import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addMonths, addDays, subMonths, startOfYear, endOfYear, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { RECURRENCE_LABELS, COST_ID_PREFIX } from "@/lib/forecastTypes";
import { queryKeys } from "@/lib/queryKeys";

export type PeriodFilter = "this_month" | "next_month" | "last_3_months" | "this_year" | "all" | "custom";
export type StatusFilter = "all" | "unpaid" | "paid" | "overdue";
export type StatusTabFilter = "all" | "sostenuti" | "previsti" | "in_ritardo" | "in_scadenza";

export interface UnifiedCost {
  id: string;
  realOrderItemId?: string;
  name: string;
  cost_type: string;
  amount: number;
  category: string | null;
  recurrence: string;
  due_date: string;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  order_id: string | null;
  order?: { id: string; order_code: string | null } | null;
  isFromOrder?: boolean;
  orderItemStatus?: string;
  supplierName?: string | null;
  supplier_id?: string | null;
  vat_rate?: number | null;
}

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

export function useCompanyCostsData(companyId: string | undefined, filters: CostsFilters, selectedYear?: number) {
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
  const { data: costs = [], isLoading } = useQuery({
    queryKey: queryKeys.costs.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*, order:orders(id, order_code), supplier:suppliers(id, name, product_category, vat_rate)")
        .eq("company_id", companyId!)
        .order("due_date", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query suppliers for the form
  const { data: suppliers = [] } = useQuery({
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
  const { data: orderItemCosts = [] } = useQuery({
    queryKey: queryKeys.costs.orderItems(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, purchase_price, status, payment_method, deposit_amount, deposit_paid, deposit_paid_date, balance_amount, balance_paid, balance_paid_date, balance_expected_date, is_paid, paid_date, supplier:suppliers(name, vat_rate), order:orders!inner(id, order_code, company_id)")
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
  const { data: externalTeamCosts = [] } = useQuery({
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
  const { data: activeEmployees = [] } = useQuery({
    queryKey: ["active-employees-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, gross_salary, is_active")
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
  const { data: commissionCosts = [] } = useQuery({
    queryKey: ["order-commission-costs", companyId],
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
  const { data: orders = [] } = useQuery({
    queryKey: ["orders-for-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Transform order items into unified cost format (split installments)
  const orderItemsAsVariableCosts: UnifiedCost[] = useMemo(() => {
    const rows: UnifiedCost[] = [];
    orderItemCosts.forEach((item: any) => {
      const pm = item.payment_method;
      const order = item.order ? { id: item.order.id, order_code: item.order.order_code } : null;
      const supplierName = item.supplier?.name || null;

      if (pm === "50_50" || pm === "30_70") {
        rows.push({
          id: `${COST_ID_PREFIX.ORDER_ITEM_DEPOSIT}${item.id}`,
          realOrderItemId: item.id,
          name: `Acconto - ${item.name}`,
          cost_type: "variable",
          amount: Number(item.deposit_amount) || 0,
          category: "Fornitori",
          recurrence: "once",
          due_date: item.deposit_paid_date || new Date().toISOString().split("T")[0],
          is_paid: !!item.deposit_paid,
          paid_date: item.deposit_paid_date || null,
          notes: null,
          order_id: order?.id || null,
          order,
          isFromOrder: true,
          orderItemStatus: item.status,
          supplierName,
          vat_rate: item.supplier?.vat_rate ?? null,
        });
        rows.push({
          id: `${COST_ID_PREFIX.ORDER_ITEM_BALANCE}${item.id}`,
          realOrderItemId: item.id,
          name: `Saldo - ${item.name}`,
          cost_type: "variable",
          amount: Number(item.balance_amount) || 0,
          category: "Fornitori",
          recurrence: "once",
          due_date: item.balance_expected_date || item.balance_paid_date || new Date().toISOString().split("T")[0],
          is_paid: !!item.balance_paid,
          paid_date: item.balance_paid_date || null,
          notes: null,
          order_id: order?.id || null,
          order,
          isFromOrder: true,
          orderItemStatus: item.status,
          supplierName,
          vat_rate: item.supplier?.vat_rate ?? null,
        });
      } else {
        rows.push({
          id: `${COST_ID_PREFIX.ORDER_ITEM}${item.id}`,
          realOrderItemId: item.id,
          name: item.name,
          cost_type: "variable",
          amount: (Number(item.purchase_price) || 0) * (Number(item.quantity) || 1),
          category: "Fornitori",
          recurrence: "once",
          due_date: item.paid_date || new Date().toISOString().split("T")[0],
          is_paid: !!item.is_paid,
          paid_date: item.paid_date || null,
          notes: null,
          order_id: order?.id || null,
          order,
          isFromOrder: true,
          orderItemStatus: item.status,
          supplierName,
          vat_rate: item.supplier?.vat_rate ?? null,
        });
      }
    });
    return rows;
  }, [orderItemCosts]);

  // Transform external teams into unified cost format
  const externalTeamAsVariableCosts: UnifiedCost[] = useMemo(() => {
    return externalTeamCosts.map((item: any): UnifiedCost => ({
      id: `${COST_ID_PREFIX.EXT_TEAM}${item.id}`,
      name: item.external_team?.name || "Squadra Esterna",
      cost_type: "variable",
      amount: Number(item.total_cost) || 0,
      category: "Squadre Esterne",
      recurrence: "once",
      due_date: item.payment_date || new Date().toISOString().split("T")[0],
      is_paid: !!item.is_paid,
      paid_date: item.paid_date || null,
      notes: null,
      order_id: item.order?.id || null,
      order: item.order ? { id: item.order.id, order_code: item.order.order_code } : null,
      isFromOrder: true,
      supplierName: null,
      vat_rate: 0,
    }));
  }, [externalTeamCosts]);

  // Transform active employees into fixed monthly salary costs
  const employeeAsFixedCosts: UnifiedCost[] = useMemo(() => {
    return activeEmployees.map((emp): UnifiedCost => ({
      id: `${COST_ID_PREFIX.EMPLOYEE_SALARY}${emp.id}`,
      name: `${emp.first_name} ${emp.last_name} (stipendio)`,
      cost_type: "fixed",
      amount: Number(emp.gross_salary) || 0,
      category: "Personale",
      recurrence: "monthly",
      due_date: format(endOfMonth(new Date()), "yyyy-MM-dd"),
      is_paid: false,
      paid_date: null,
      notes: null,
      order_id: null,
      order: null,
      isFromOrder: true,
      supplierName: null,
      vat_rate: 0,
    }));
  }, [activeEmployees]);

  // Transform commissions into unified cost format
  const commissionAsVariableCosts: UnifiedCost[] = useMemo(() => {
    return commissionCosts.map((item: any): UnifiedCost => ({
      id: `${COST_ID_PREFIX.COMMISSION}${item.id}`,
      name: `${item.salesperson?.first_name || ""} ${item.salesperson?.last_name || ""}`.trim() || "Venditore",
      cost_type: "variable",
      amount: Number(item.commission_amount) || 0,
      category: "Provvigioni",
      recurrence: "once",
      due_date: item.payment_expected_date || new Date().toISOString().split("T")[0],
      is_paid: !!item.is_paid,
      paid_date: item.paid_date || null,
      notes: null,
      order_id: item.order?.id || null,
      order: item.order ? { id: item.order.id, order_code: item.order.order_code } : null,
      isFromOrder: true,
      supplierName: null,
      vat_rate: 0,
    }));
  }, [commissionCosts]);

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
      filtered = filtered.filter((c: any) => c.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((c: any) =>
        c.name.toLowerCase().includes(q) ||
        (c.supplier?.name || "").toLowerCase().includes(q)
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
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(q) || (c.supplierName || "").toLowerCase().includes(q));
    }
    if (statusFilter === "paid") filtered = filtered.filter((c) => c.is_paid);
    else if (statusFilter === "unpaid") filtered = filtered.filter((c) => !c.is_paid);
    if (categoryFilter !== "all") {
      filtered = filtered.filter((c) => c.category === categoryFilter);
    }
    return filtered;
  }, [allOrderDerivedCosts, getPeriodRange, searchQuery, statusFilter, categoryFilter, originFilter]);

  // Query cost categories from dedicated table
  const { data: dbCategories = [] } = useQuery({
    queryKey: ["cost-category-names", companyId],
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

  // Dynamic categories: DB categories + legacy categories from costs (backward compat)
  const dynamicCategories = useMemo(() => {
    const cats = new Set<string>(dbCategories);
    costs.forEach((c: any) => { if (c.category) cats.add(c.category); });
    suppliers.forEach((s: any) => { if (s.product_category) cats.add(s.product_category); });
    allOrderDerivedCosts.forEach((c) => { if (c.category) cats.add(c.category); });
    if (cats.size === 0) {
      ["Affitto", "Utenze", "Assicurazioni", "Leasing", "Trasporti", "Consulenze", "Marketing", "Software", "Tasse", "Materiali", "Altro"].forEach(c => cats.add(c));
    }
    return Array.from(cats).sort();
  }, [dbCategories, costs, suppliers, allOrderDerivedCosts]);

  // Monthly distribution — 12 months (6 past + 6 future) — single pass
  const monthlyDistribution = useMemo(() => {
    const now = new Date();
    const currentMonthStr = format(now, "yyyy-MM");
    const allRaw = [...(costs as any[]), ...allOrderDerivedCosts];

    // Pre-compute month boundaries
    const months: { ms: Date; me: Date; key: string; label: string }[] = [];
    for (let i = -5; i <= 6; i++) {
      const ms = startOfMonth(addMonths(now, i));
      const me = endOfMonth(addMonths(now, i));
      months.push({ ms, me, key: format(ms, "yyyy-MM"), label: format(ms, "MMM yy", { locale: it }) });
    }

    // Accumulators per month
    const buckets = new Map<string, { fixed: number; variable: number; paidEffective: number; previsto: number; sostenuto: number }>();
    for (const m of months) {
      buckets.set(m.key, { fixed: 0, variable: 0, paidEffective: 0, previsto: 0, sostenuto: 0 });
    }

    const firstMonth = months[0].ms.getTime();
    const lastMonth = months[months.length - 1].me.getTime();

    // Single pass over all costs
    for (const c of allRaw) {
      if (c.due_date) {
        const d = new Date(c.due_date);
        const dt = d.getTime();
        if (dt >= firstMonth && dt <= lastMonth) {
          const key = format(d, "yyyy-MM");
          const b = buckets.get(key);
          if (b) {
            const amt = Number(c.amount);
            if (c.cost_type === "fixed") b.fixed += amt; else b.variable += amt;
            b.previsto += amt;
          }
        }
      }
      if (c.is_paid && c.paid_date) {
        const pd = new Date(c.paid_date);
        const pdt = pd.getTime();
        if (pdt >= firstMonth && pdt <= lastMonth) {
          const key = format(pd, "yyyy-MM");
          const b = buckets.get(key);
          if (b) {
            const amt = Number(c.amount);
            b.paidEffective += amt;
            b.sostenuto += amt;
          }
        }
      }
    }

    return months.map(m => {
      const b = buckets.get(m.key)!;
      return {
        month: m.label,
        monthKey: m.key,
        Fissi: b.fixed,
        Variabili: b.variable,
        PagatoEffettivo: b.paidEffective,
        Totale: b.fixed + b.variable,
        Previsto: b.previsto,
        Sostenuto: b.sostenuto,
        isCurrent: m.key === currentMonthStr,
      };
    });
  }, [costs, allOrderDerivedCosts]);

  // Cost name counts for group delete
  const costNameCounts = useMemo(() => {
    const map = new Map<string, number>();
    costs.forEach((c: any) => map.set(c.name, (map.get(c.name) || 0) + 1));
    return map;
  }, [costs]);

  // VAT calculations for stats
  const vatStats = useMemo(() => {
    let vatDebit = 0;
    let supplierUnpaid = 0;
    const allUnified = [...filteredCosts, ...filteredOrderItemCosts];
    allUnified.forEach((c: any) => {
      if (!c.is_paid) {
        const rate = Number(c.vat_rate) || 0;
        const vatAmount = Number(c.amount) * (rate / 100);
        vatDebit += vatAmount;
        if (c.supplier_id || c.supplierName || c.category === "Fornitori") {
          supplierUnpaid += Number(c.amount);
        }
      }
    });
    return { vatDebit, supplierUnpaid };
  }, [filteredCosts, filteredOrderItemCosts]);

  // Computed sorted/filtered lists
  const manualFixedCosts = filteredCosts.filter((c: any) => c.cost_type === "fixed");
  const manualVariableCosts = filteredCosts.filter((c: any) => c.cost_type === "variable");
  const orderDerivedFixed = filteredOrderItemCosts.filter((c) => c.cost_type === "fixed");
  const orderDerivedVariable = filteredOrderItemCosts.filter((c) => c.cost_type === "variable");
  const fixedCosts = [...manualFixedCosts, ...orderDerivedFixed];
  const variableCostsWithOrders = [...manualVariableCosts, ...orderDerivedVariable];

  const allCostsSorted = useMemo(() => {
    const now = new Date();
    const soon = addDays(now, 7);
    return [...filteredCosts, ...filteredOrderItemCosts].sort((a: any, b: any) => {
      const getPriority = (c: any) => {
        if (c.is_paid) return 4;
        const d = c.due_date ? new Date(c.due_date) : null;
        if (d && d < now) return 1;
        if (d && d <= soon) return 2;
        return 3;
      };
      const pA = getPriority(a), pB = getPriority(b);
      if (pA !== pB) return pA - pB;
      const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
      return pA === 4 ? dateB - dateA : dateA - dateB;
    });
  }, [filteredCosts, filteredOrderItemCosts]);

  // Status tab pre-filtered lists
  const statusTabLists = useMemo(() => {
    const now = new Date();
    const soon = addDays(now, 7);
    const all = allCostsSorted;

    const sostenuti = all.filter(c => c.is_paid);
    const previsti = all.filter(c => c.recurrence !== "once" && !c.is_paid && c.due_date && new Date(c.due_date) > now);
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
    const previstiList = allFiltered.filter((c: any) => c.recurrence !== "once" && !c.is_paid && c.due_date && new Date(c.due_date) > now);

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

  // CSV export
  const exportCostsCSV = () => {
    const allForExport = [...filteredCosts, ...filteredOrderItemCosts];
    const rows = [["Nome", "Tipo", "Categoria", "Imponibile", "IVA%", "Totale Lordo", "Fornitore", "Ricorrenza", "Scadenza", "Stato", "Origine"]];
    allForExport.forEach((c: any) => {
      const vatRate = Number(c.vat_rate) || 0;
      const gross = calculateGrossFromNet(Number(c.amount), vatRate);
      rows.push([
        c.name,
        c.cost_type === "fixed" ? "Fisso" : "Variabile",
        c.category || "",
        String(c.amount),
        String(vatRate),
        String(gross.grossAmount),
        c.supplier?.name || c.supplierName || "",
        RECURRENCE_LABELS[c.recurrence] || c.recurrence,
        c.due_date ? format(new Date(c.due_date), "dd/MM/yyyy") : "",
        c.is_paid ? "Pagato" : c.due_date && new Date(c.due_date) < new Date() ? "Scaduto" : "Da pagare",
        c.isFromOrder ? "Da Ordine" : "Manuale",
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `costi-aziendali-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Category distribution for PieChart
  const categoryDistribution = useMemo(() => {
    const catMap = new Map<string, number>();
    allCostsSorted.forEach((c: any) => {
      const cat = c.category || "Altro";
      catMap.set(cat, (catMap.get(cat) || 0) + Number(c.amount));
    });
    const sorted = Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= 7) return sorted;
    const top6 = sorted.slice(0, 6);
    const otherValue = sorted.slice(6).reduce((s, c) => s + c.value, 0);
    return [...top6, { name: "Altro", value: otherValue }];
  }, [allCostsSorted]);

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
    isLoading,
    exportCostsCSV,
  };
}
