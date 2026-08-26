import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isWithinInterval, startOfMonth, endOfMonth, addMonths, addDays, subMonths, startOfYear, endOfYear, parseISO, startOfDay, endOfDay } from "date-fns";
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
  computeCostiSenzaScadenza,
  exportCostsToCSV,
  calculateBreakEven,
  EMPLOYEE_PROJECTION_MONTHS,
} from "@/lib/costsUtils";

export type { BreakEvenData } from "@/lib/costsUtils";

export type PeriodFilter = "this_month" | "next_month" | "last_3_months" | "this_year" | "all" | "custom";
export type StatusFilter = "all" | "unpaid" | "paid" | "overdue";
export type StatusTabFilter = "all" | "sostenuti" | "previsti" | "in_ritardo" | "in_scadenza" | "senza_scadenza";

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

function parseCostDate(value?: string | null): Date | null {
  if (!value || value === "9999-12-31") return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const costsQuery = useQuery({
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
  const { data: costs = [], isLoading: isLoadingCosts } = costsQuery;

  // Query suppliers for the form
  const suppliersQuery = useQuery({
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
  const { data: suppliers = [], isLoading: isLoadingSuppliers } = suppliersQuery;

  // Query ALL order items with supplier (for split payments)
  const orderItemsQuery = useQuery({
    queryKey: queryKeys.costs.orderItems(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, name, quantity, purchase_price, status, payment_method, supplier_id, deposit_amount, deposit_expected_date, deposit_paid, deposit_paid_date, balance_amount, balance_paid, balance_paid_date, balance_expected_date, is_paid, paid_date, supplier:suppliers(name, vat_rate), order:orders!inner(id, order_code, company_id)")
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
  const { data: orderItemCosts = [], isLoading: isLoadingOrderItems } = orderItemsQuery;

  // Query external teams from orders
  const externalTeamsQuery = useQuery({
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
  const { data: externalTeamCosts = [], isLoading: isLoadingExternalTeams } = externalTeamsQuery;

  // Query all active employees for monthly salary costs
  const employeesQuery = useQuery({
    queryKey: queryKeys.costs.employees(companyId),
    queryFn: async () => {
      // Le date VERE di assunzione/cessazione vivono nell'anagrafica HR
      // (hr_profili): quando compilate, la proiezione stipendi parte e si
      // ferma lì invece che su created_at (= onboarding piattaforma).
      const { data, error } = await (supabase as any)
        .from("employees")
        .select("id, first_name, last_name, gross_salary, is_active, created_at, inps_rate, data_assunzione, hr_profili(data_assunzione, data_cessazione)")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return (data || []).map((e: any) => ({
        ...e,
        hire_date: e.data_assunzione ?? e.hr_profili?.[0]?.data_assunzione ?? null,
        termination_date: e.hr_profili?.[0]?.data_cessazione ?? null,
      }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const { data: activeEmployees = [], isLoading: isLoadingEmployees } = employeesQuery;

  // Query commissions from orders
  const commissionsQuery = useQuery({
    queryKey: queryKeys.costs.commissions(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select("id, commission_amount, deduction_amount, is_paid, paid_date, payment_expected_date, salesperson:salespeople!inner(first_name, last_name, company_id), order:orders!inner(id, order_code, company_id)")
        .eq("salesperson.company_id", companyId!);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const { data: commissionCosts = [], isLoading: isLoadingCommissions } = commissionsQuery;

  // Query orders for linking
  // Margine e valore medio VERI dalle commesse degli ultimi 12 mesi (stessa
  // vista di scheda commessa e CdG). Attenzione ai nomi della vista: il
  // ricavo è preventivo_totale (contratto + variazioni approvate) e
  // "consuntivo" è la SOMMA DEI COSTI, non il fatturato. Contano solo le
  // commesse con entrambe le facce (>0); senza, si torna alle ipotesi
  // 30% / 15.000 €, ma dichiarandolo.
  const margineRealeQuery = useQuery({
    queryKey: ["break-even-margini", companyId],
    queryFn: async (): Promise<{ marginePerc: number; commessaMedia: number } | null> => {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      const { data, error } = await (supabase as any)
        .from("v_ordine_marginalita")
        .select("preventivo_totale, consuntivo")
        .eq("company_id", companyId!)
        .gt("preventivo_totale", 0)
        .gt("consuntivo", 0)
        .gte("created_at", cutoff.toISOString())
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as { preventivo_totale: number | null; consuntivo: number | null }[];
      if (rows.length === 0) return null;
      const ricavi = rows.reduce((s, r) => s + (Number(r.preventivo_totale) || 0), 0);
      const costi = rows.reduce((s, r) => s + (Number(r.consuntivo) || 0), 0);
      if (ricavi <= 0) return null;
      return {
        marginePerc: Math.round(((ricavi - costi) / ricavi) * 1000) / 10,
        commessaMedia: Math.round(ricavi / rows.length),
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
  const margineReale = margineRealeQuery.data ?? null;

  const ordersQuery = useQuery({
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
  const { data: orders = [], isLoading: isLoadingOrders } = ordersQuery;

  // Transform raw data into unified cost format using extracted utilities
  const orderItemsAsVariableCosts = useMemo(() => buildOrderItemCosts(orderItemCosts), [orderItemCosts]);
  const externalTeamAsVariableCosts = useMemo(() => buildExternalTeamCosts(externalTeamCosts), [externalTeamCosts]);
  const employeeAsFixedCosts = useMemo(() => buildEmployeeCosts(activeEmployees), [activeEmployees]);
  // Stipendi PROIETTATI anche nel futuro (+12 mesi): alimentano le viste di
  // pianificazione (Panoramica, Situazione anno, distribuzione, semaforo cassa).
  // Le liste operative della tab Spese restano sul set storico per non
  // riempirsi di centinaia di righe stipendio future.
  const employeeAsFixedCostsProjected = useMemo(
    () => buildEmployeeCosts(activeEmployees, EMPLOYEE_PROJECTION_MONTHS),
    [activeEmployees],
  );
  const commissionAsVariableCosts = useMemo(() => buildCommissionCosts(commissionCosts), [commissionCosts]);

  // All order-derived costs combined
  const allOrderDerivedCosts = useMemo(() => [
    ...orderItemsAsVariableCosts,
    ...externalTeamAsVariableCosts,
    ...employeeAsFixedCosts,
    ...commissionAsVariableCosts,
  ], [orderItemsAsVariableCosts, externalTeamAsVariableCosts, employeeAsFixedCosts, commissionAsVariableCosts]);

  // Variante di pianificazione: identica ma con gli stipendi proiettati.
  const allOrderDerivedCostsProjected = useMemo(() => [
    ...orderItemsAsVariableCosts,
    ...externalTeamAsVariableCosts,
    ...employeeAsFixedCostsProjected,
    ...commissionAsVariableCosts,
  ], [orderItemsAsVariableCosts, externalTeamAsVariableCosts, employeeAsFixedCostsProjected, commissionAsVariableCosts]);

  // Filtering logic for manual costs
  const filteredCosts = useMemo(() => {
    if (originFilter === "order") return [];
    const now = new Date();
    const todayStart = startOfDay(now);
    let filtered = costs as any[];

    if (getPeriodRange) {
      const { start, end } = getPeriodRange;
      filtered = filtered.filter((c: any) => {
        if (!c.due_date) return false;
        const dueDate = parseCostDate(c.due_date);
        return !!dueDate && isWithinInterval(dueDate, { start, end });
      });
    }

    if (statusFilter === "paid") filtered = filtered.filter((c: any) => c.is_paid);
    else if (statusFilter === "unpaid") filtered = filtered.filter((c: any) => !c.is_paid && (!c.due_date || parseCostDate(c.due_date)! >= todayStart));
    else if (statusFilter === "overdue") filtered = filtered.filter((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      return !c.is_paid && !!dueDate && dueDate < todayStart;
    });

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
    const todayStart = startOfDay(now);
    let filtered = allOrderDerivedCosts;
    if (getPeriodRange) {
      const { start, end } = getPeriodRange;
      filtered = filtered.filter(c => {
        if (!c.due_date) return false;
        const dueDate = parseCostDate(c.due_date);
        return !!dueDate && isWithinInterval(dueDate, { start, end });
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
    else if (statusFilter === "unpaid") filtered = filtered.filter((c) => !c.is_paid && (!c.due_date || parseCostDate(c.due_date)! >= todayStart));
    else if (statusFilter === "overdue") filtered = filtered.filter((c) => {
      const dueDate = parseCostDate(c.due_date);
      return !c.is_paid && !!dueDate && dueDate < todayStart;
    });
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

  // Fatturato del mese corrente (fatture emesse, cestinate escluse): serve al
  // break-even, che prima riceveva un fatturato hard-coded a 0 e mostrava
  // "Sotto break-even · 0% coperto" a vita, per qualunque azienda.
  const monthRevenueQuery = useQuery({
    queryKey: [...queryKeys.costs.list(companyId), "fatturato-mese"],
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("total")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .gte("issue_date", format(startOfMonth(now), "yyyy-MM-dd"))
        .lte("issue_date", format(endOfMonth(now), "yyyy-MM-dd"));
      if (error) throw error;
      return (data || []).reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const monthlyRevenue = monthRevenueQuery.data ?? 0;

  // Query cost categories from dedicated table
  const categoriesQuery = useQuery({
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
  const { data: dbCategories = [] } = categoriesQuery;

  const dynamicCategories = useMemo(() => buildDynamicCategories(dbCategories, costs as any[], suppliers as any[], allOrderDerivedCosts), [dbCategories, costs, suppliers, allOrderDerivedCosts]);

  // Distribuzione mensile (-5…+6): usa gli stipendi proiettati, altrimenti i
  // 6 mesi futuri del grafico "Previsto" erano vuoti di personale.
  const monthlyDistribution = useMemo(() => buildMonthlyDistribution(costs as any[], allOrderDerivedCostsProjected), [costs, allOrderDerivedCostsProjected]);

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
      // Stesso fallback del footer tabella (aliquota del fornitore quando il
      // costo non la dichiara), con `??`: 0 esplicito = esente, non "manca".
      const rate = Number(c.vat_rate ?? c.supplier?.vat_rate ?? 0) || 0;
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

  // All costs unfiltered (Panoramica, budget, regia — not affected by active
  // filters). Include gli stipendi proiettati: è il dataset di PIANIFICAZIONE.
  const allCostsUnfiltered = useMemo(() =>
    sortCostsByPriority([...(costs as any[]), ...allOrderDerivedCostsProjected]),
    [costs, allOrderDerivedCostsProjected]
  );

  // Costi che nessun totale di periodo può contenere (scadenza assente):
  // vengono dichiarati in Panoramica e Pianificazione invece di sparire.
  const senzaScadenzaStats = useMemo(
    () => computeCostiSenzaScadenza(allCostsUnfiltered as any[]),
    [allCostsUnfiltered],
  );

  // Status tab pre-filtered lists
  const statusTabLists = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const soonEnd = endOfDay(addDays(now, 7));
    const all = allCostsSorted;

    const sostenuti = all.filter(c => c.is_paid);
    const previsti = all.filter(c => {
      const dueDate = parseCostDate(c.due_date);
      return !c.is_paid && !!dueDate && dueDate >= todayStart;
    });
    const inRitardo = all.filter(c => {
      const dueDate = parseCostDate(c.due_date);
      return !c.is_paid && !!dueDate && dueDate < todayStart;
    });
    const inScadenza = all.filter(c => {
      if (c.is_paid || !c.due_date) return false;
      const d = parseCostDate(c.due_date);
      return !!d && d >= todayStart && d <= soonEnd;
    });
    const senzaScadenza = all.filter(c => !c.is_paid && (!c.due_date || c.due_date === "9999-12-31"));

    return { sostenuti, previsti, inRitardo, inScadenza, senzaScadenza };
  }, [allCostsSorted]);

  // Apply status tab filter
  const statusTabFilteredCosts = useMemo(() => {
    switch (statusTabFilter) {
      case "sostenuti": return statusTabLists.sostenuti;
      case "previsti": return statusTabLists.previsti;
      case "in_ritardo": return statusTabLists.inRitardo;
      case "in_scadenza": return statusTabLists.inScadenza;
      case "senza_scadenza": return statusTabLists.senzaScadenza;
      default: return allCostsSorted;
    }
  }, [statusTabFilter, statusTabLists, allCostsSorted]);

  // Stats — reactive to active filters
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const soonEnd = endOfDay(addDays(now, 7));
    const allFiltered = [...filteredCosts, ...filteredOrderItemCosts] as any[];

    const unpaid = allFiltered.filter((c: any) => !c.is_paid);
    const paid = allFiltered.filter((c: any) => c.is_paid);
    const overdue = unpaid.filter((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      return !!dueDate && dueDate < todayStart;
    });
    const expiringSoon = unpaid.filter((c: any) => {
      if (!c.due_date) return false;
      const d = parseCostDate(c.due_date);
      return !!d && d >= todayStart && d <= soonEnd;
    });
    const previstiList = allFiltered.filter((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      return !c.is_paid && !!dueDate && dueDate >= todayStart;
    });

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

  // Yearly stats — TUTTE le card "Situazione anno" leggono da qui, sullo
  // stesso universo (costi con scadenza nell'anno, stipendi proiettati
  // inclusi). Prima le card sotto ("Sostenuti", "Previsti"…) sommavano lo
  // storico COMPLETO: il pagato superava il "Totale Anno" nella stessa schermata.
  const yearlyStats = useMemo(() => {
    const yearStart = startOfYear(new Date(yearForStats, 0, 1));
    const yearEnd = endOfYear(new Date(yearForStats, 0, 1));
    const now = new Date();
    const todayStart = startOfDay(now);
    const soonEnd = endOfDay(addDays(now, 7));
    const allRaw = [...(costs as any[]), ...allOrderDerivedCostsProjected];
    const yearCosts = allRaw.filter((c: any) => {
      if (!c.due_date) return false;
      const d = parseCostDate(c.due_date);
      if (!d) return false;
      return d >= yearStart && d <= yearEnd;
    });
    const total = yearCosts.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const paidItems = yearCosts.filter((c: any) => c.is_paid);
    const unpaidItems = yearCosts.filter((c: any) => !c.is_paid);
    const overdueItems = unpaidItems.filter((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      return !!dueDate && dueDate < todayStart;
    });
    const previstiItems = unpaidItems.filter((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      return !!dueDate && dueDate >= todayStart;
    });
    const expiringItems = previstiItems.filter((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      return !!dueDate && dueDate <= soonEnd;
    });
    const totalPaid = paidItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalUnpaid = unpaidItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalOverdue = overdueItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalPrevisti = previstiItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalExpiringSoon = expiringItems.reduce((s: number, c: any) => s + Number(c.amount), 0);
    // IVA detraibile dell'anno, stessa regola della tabella (fallback fornitore).
    let vatYear = 0;
    let vatYearUnpaid = 0;
    yearCosts.forEach((c: any) => {
      const rate = Number(c.vat_rate ?? c.supplier?.vat_rate ?? 0) || 0;
      const vatAmount = Number(c.amount) * (rate / 100);
      vatYear += vatAmount;
      if (!c.is_paid) vatYearUnpaid += vatAmount;
    });
    const pctPaid = total > 0 ? Math.round((totalPaid / total) * 100) : 0;
    return {
      total, totalPaid, totalUnpaid, totalOverdue, pctPaid, count: yearCosts.length,
      paidCount: paidItems.length,
      totalPrevisti, previstiCount: previstiItems.length,
      overdueCount: overdueItems.length,
      totalExpiringSoon, expiringSoonCount: expiringItems.length,
      vatYear, vatYearUnpaid,
    };
  }, [costs, allOrderDerivedCostsProjected, yearForStats]);

  // CSV export — delegate to shared utility to avoid duplication
  const exportCostsCSV = () => exportCostsToCSV(filteredCosts, filteredOrderItemCosts);

  // Category distribution for PieChart
  const categoryDistribution = useMemo(() => buildCategoryDistribution(allCostsSorted), [allCostsSorted]);

  // Available years from costs data
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    (costs || []).forEach((c: any) => {
      const dueDate = parseCostDate(c.due_date);
      if (!dueDate) return;
      const y = dueDate.getFullYear();
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
        const dueDate = parseCostDate(c.due_date);
        if (!dueDate) return;
        const cKey = format(dueDate, "yyyy-MM");
        if (cKey !== key) return;
        if (c.cost_type === "fixed") fixed += Number(c.amount);
        else variable += Number(c.amount);
      });
      const total = fixed + variable;
      return { month: label, pctFixed: total > 0 ? Math.round((fixed / total) * 100) : 0 };
    });
  }, [allCostsSorted]);

  const queryErrors = [
    costsQuery.error,
    suppliersQuery.error,
    orderItemsQuery.error,
    externalTeamsQuery.error,
    employeesQuery.error,
    commissionsQuery.error,
    ordersQuery.error,
    categoriesQuery.error,
    monthRevenueQuery.error,
  ].filter(Boolean);

  const refetchAll = () => {
    void costsQuery.refetch();
    void suppliersQuery.refetch();
    void orderItemsQuery.refetch();
    void externalTeamsQuery.refetch();
    void employeesQuery.refetch();
    void commissionsQuery.refetch();
    void ordersQuery.refetch();
    void categoriesQuery.refetch();
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
    isError: queryErrors.length > 0,
    errorMessage: queryErrors[0] instanceof Error ? queryErrors[0].message : "Impossibile caricare tutti i dati dei costi.",
    refetchAll,
    exportCostsCSV,
    allCostsUnfiltered,
    senzaScadenzaStats,
    monthlyRevenue,
    breakEvenData: margineReale
      ? calculateBreakEven(fixedCosts, monthlyRevenue, margineReale.commessaMedia, margineReale.marginePerc, true)
      : calculateBreakEven(fixedCosts, monthlyRevenue),
    // La query costi ha .limit(1000): se torna esattamente 1000 righe i
    // totali potrebbero essere PARZIALI — il chiamante mostra un avviso.
    costsTruncated: costs.length >= 1000,
  };
}
