import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addMonths, subMonths, startOfYear, endOfYear } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { calculateGrossFromNet } from "@/lib/vatUtils";

export type PeriodFilter = "this_month" | "next_month" | "last_3_months" | "this_year" | "all";
export type StatusFilter = "all" | "unpaid" | "paid" | "overdue";

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
}

export function useCompanyCostsData(companyId: string | undefined, filters: CostsFilters) {
  const { periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter } = filters;

  // Query costs with supplier join
  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["company-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*, order:orders(id, order_code), supplier:suppliers(id, name, product_category, vat_rate)")
        .eq("company_id", companyId!)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Query suppliers for the form
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-for-costs", companyId],
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
  });

  // Query ALL order items with supplier (for split payments)
  const { data: orderItemCosts = [] } = useQuery({
    queryKey: ["order-item-costs-full", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, purchase_price, status, payment_method, deposit_amount, deposit_paid, deposit_paid_date, balance_amount, balance_paid, balance_paid_date, balance_expected_date, is_paid, paid_date, supplier:suppliers(name), order:orders!inner(id, order_code, company_id)")
        .not("supplier_id", "is", null)
        .is("stock_item_id", null)
        .eq("order.company_id", companyId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Query external teams from orders
  const { data: externalTeamCosts = [] } = useQuery({
    queryKey: ["order-external-team-costs", companyId],
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
          id: `order-item-dep-${item.id}`,
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
        });
        rows.push({
          id: `order-item-bal-${item.id}`,
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
        });
      } else {
        rows.push({
          id: `order-item-${item.id}`,
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
        });
      }
    });
    return rows;
  }, [orderItemCosts]);

  // Transform external teams into unified cost format
  const externalTeamAsVariableCosts: UnifiedCost[] = useMemo(() => {
    return externalTeamCosts.map((item: any) => ({
      id: `ext-team-${item.id}`,
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
    }));
  }, [externalTeamCosts]);

  // Transform active employees into fixed monthly salary costs
  const employeeAsFixedCosts: UnifiedCost[] = useMemo(() => {
    return activeEmployees.map((emp) => ({
      id: `employee-salary-${emp.id}`,
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
    }));
  }, [activeEmployees]);

  // Transform commissions into unified cost format
  const commissionAsVariableCosts: UnifiedCost[] = useMemo(() => {
    return commissionCosts.map((item: any) => ({
      id: `commission-${item.id}`,
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

    if (periodFilter !== "all") {
      let start: Date, end: Date;
      if (periodFilter === "this_month") { start = startOfMonth(now); end = endOfMonth(now); }
      else if (periodFilter === "next_month") { start = startOfMonth(addMonths(now, 1)); end = endOfMonth(addMonths(now, 1)); }
      else if (periodFilter === "last_3_months") { start = startOfMonth(subMonths(now, 2)); end = endOfMonth(now); }
      else { start = startOfYear(now); end = endOfYear(now); }
      filtered = filtered.filter((c: any) => {
        if (!c.due_date) return false;
        const d = new Date(c.due_date);
        return isWithinInterval(d, { start, end });
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
  }, [costs, periodFilter, statusFilter, searchQuery, supplierFilter, categoryFilter, originFilter]);

  // Filtering logic for order-derived costs
  const filteredOrderItemCosts = useMemo(() => {
    if (originFilter === "manual") return [];
    let filtered = allOrderDerivedCosts;
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
  }, [allOrderDerivedCosts, searchQuery, statusFilter, categoryFilter, originFilter]);

  // Dynamic categories from costs + suppliers
  const dynamicCategories = useMemo(() => {
    const cats = new Set<string>();
    costs.forEach((c: any) => { if (c.category) cats.add(c.category); });
    suppliers.forEach((s: any) => { if (s.product_category) cats.add(s.product_category); });
    allOrderDerivedCosts.forEach((c) => { if (c.category) cats.add(c.category); });
    if (cats.size === 0) {
      ["Affitto", "Utenze", "Assicurazioni", "Leasing", "Trasporti", "Consulenze", "Marketing", "Software", "Tasse", "Materiali", "Altro"].forEach(c => cats.add(c));
    }
    return Array.from(cats).sort();
  }, [costs, suppliers, allOrderDerivedCosts]);

  // Monthly distribution for mini-chart
  const monthlyDistribution = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 0; i < 6; i++) {
      const ms = startOfMonth(addMonths(now, i));
      const me = endOfMonth(addMonths(now, i));
      let fixed = 0, variable = 0;
      costs.forEach((c: any) => {
        if (c.is_paid) return;
        if (!c.due_date) return;
        const d = new Date(c.due_date);
        if (d >= ms && d <= me) {
          if (c.cost_type === "fixed") fixed += Number(c.amount);
          else variable += Number(c.amount);
        }
      });
      allOrderDerivedCosts.forEach((c) => {
        if (c.is_paid) return;
        if (!c.due_date) return;
        const d = new Date(c.due_date);
        if (d >= ms && d <= me) {
          variable += c.amount;
        }
      });
      months.push({
        month: format(ms, "MMM yy", { locale: it }),
        Fissi: fixed,
        Variabili: variable,
      });
    }
    return months;
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
    costs.forEach((c: any) => {
      if (!c.is_paid) {
        const rate = Number(c.vat_rate) || 0;
        const vatAmount = Number(c.amount) * (rate / 100);
        vatDebit += vatAmount;
        if (c.supplier_id) {
          supplierUnpaid += Number(c.amount);
        }
      }
    });
    return { vatDebit, supplierUnpaid };
  }, [costs]);

  // Computed sorted/filtered lists
  const fixedCosts = filteredCosts.filter((c: any) => c.cost_type === "fixed");
  const manualVariableCosts = filteredCosts.filter((c: any) => c.cost_type === "variable");
  const variableCostsWithOrders = [...manualVariableCosts, ...filteredOrderItemCosts];
  const allCostsSorted = [...filteredCosts, ...filteredOrderItemCosts].sort((a: any, b: any) => {
    const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
    const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
    return dateA - dateB;
  });

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthInterval = { start: startOfMonth(now), end: endOfMonth(now) };

    const thisMonthUnpaid = costs.filter((c: any) => !c.is_paid && c.due_date && isWithinInterval(new Date(c.due_date), thisMonthInterval));
    const thisMonthPaid = costs.filter((c: any) => c.is_paid && c.paid_date && isWithinInterval(new Date(c.paid_date), thisMonthInterval));
    const overdueCosts = costs.filter((c: any) => !c.is_paid && new Date(c.due_date) < now);

    const orderDerivedThisMonthUnpaid = allOrderDerivedCosts.filter(c => !c.is_paid && c.due_date && isWithinInterval(new Date(c.due_date), thisMonthInterval));
    const orderDerivedThisMonthPaid = allOrderDerivedCosts.filter(c => c.is_paid && c.paid_date && isWithinInterval(new Date(c.paid_date), thisMonthInterval));

    const totalUnpaidThisMonth = thisMonthUnpaid.reduce((s: number, c: any) => s + Number(c.amount), 0) + orderDerivedThisMonthUnpaid.reduce((s, c) => s + c.amount, 0);
    const totalPaidThisMonth = thisMonthPaid.reduce((s: number, c: any) => s + Number(c.amount), 0) + orderDerivedThisMonthPaid.reduce((s, c) => s + c.amount, 0);
    const totalOverdue = overdueCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);

    return {
      totalUnpaidThisMonth,
      totalPaidThisMonth,
      totalOverdue,
      unpaidCount: thisMonthUnpaid.length + orderDerivedThisMonthUnpaid.length,
      paidCount: thisMonthPaid.length + orderDerivedThisMonthPaid.length,
      overdueCount: overdueCosts.length,
    };
  }, [costs, allOrderDerivedCosts]);

  // CSV export
  const exportCostsCSV = () => {
    const allForExport = [...filteredCosts, ...filteredOrderItemCosts];
    const rows = [["Nome", "Tipo", "Categoria", "Imponibile", "IVA%", "Totale Lordo", "Fornitore", "Ricorrenza", "Scadenza", "Stato", "Origine"]];
    const RECURRENCE_LABELS: Record<string, string> = {
      once: "Una tantum", monthly: "Mensile", quarterly: "Trimestrale", yearly: "Annuale",
    };
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
    dynamicCategories,
    monthlyDistribution,
    costNameCounts,
    vatStats,
    stats,
    isLoading,
    exportCostsCSV,
  };
}
