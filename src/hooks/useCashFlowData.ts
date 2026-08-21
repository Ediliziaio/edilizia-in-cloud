import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";


import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { calculateStoredCommissionNet } from "@/lib/commissions";
import type {
  ExpectedPayment,
  ExpectedExpense,
  ExpectedCommission,
  ExpectedSupplierPayment,
  CompanyCostEntry,
  ExternalTeamPayment,
  ForecastStats,
} from "@/lib/forecastTypes";

// Pure JS date helpers (date-fns not imported here to keep the bundle lean)
function addMonthsJs(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function subMonthsJs(date: Date, months: number): Date {
  return addMonthsJs(date, -months);
}

export function useCashFlowData({ monthsAhead = 6 }: { monthsAhead?: number } = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Date LOCALI (en-CA = YYYY-MM-DD in fuso locale). Con toISOString() vicino a
  // mezzanotte il confine finestra slittava di un giorno (UTC vs Europe/Rome).
  const startDate = new Date().toLocaleDateString("en-CA");
  const endDate = addMonthsJs(new Date(), monthsAhead).toLocaleDateString("en-CA");
  const costDateFrom = subMonthsJs(new Date(), 3).toLocaleDateString("en-CA");

  // Query installments (rate dinamiche da order_installments con join su orders)
  const { data: installmentsData = [], isLoading: loadingOrders, isError: errOrders } = useQuery({
    queryKey: queryKeys.cashflow.installments(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments")
        .select(`
          id, order_id, position, label, type, amount, is_paid, paid_date, expected_date,
          order:orders!inner(id, order_code, company_id, customer:profiles!orders_customer_id_fkey(first_name, last_name))
        `)
        .eq("order.company_id", companyId!)
        .lte("expected_date", endDate)
        .order("position", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query squadre esterne non pagate
  const { data: externalTeamPayments = [], isLoading: loadingTeams, isError: errTeams } = useQuery({
    queryKey: queryKeys.cashflow.externalTeams(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select(`
          id, total_cost, payment_date, is_paid,
          order:orders!inner(id, order_code, company_id),
          external_team:external_teams(name)
        `)
        .eq("is_paid", false)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      return data as ExternalTeamPayment[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query provvigioni non pagate
  const { data: unpaidCommissions = [], isLoading: loadingCommissions, isError: errCommissions } = useQuery({
    queryKey: queryKeys.cashflow.commissions(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, commission_amount, deduction_amount, payment_expected_date, is_paid,
          salesperson:salespeople!inner(first_name, last_name, company_id),
          order:orders!inner(id, order_code, company_id)
        `)
        .eq("is_paid", false)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Articoli il cui acquisto è GIÀ un costo (ODA ricevuto o fattura del
  // fornitore contabilizzata): vanno esclusi dalle uscite stimate, altrimenti
  // lo stesso euro pesa due volte sulla cassa prevista — una come articolo da
  // pagare e una come costo da pagare.
  const { data: articoliGiaACosto = [] } = useQuery({
    queryKey: ["articoli-gia-a-costo", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_articoli_gia_a_costo")
        .select("order_item_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      return ((data ?? []) as Array<{ order_item_id: string }>).map((r) => r.order_item_id);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  const idsGiaACosto = useMemo(() => new Set(articoliGiaACosto), [articoliGiaACosto]);

  // Query articoli da ordinare/ordinati
  const { data: pendingItemsRaw = [], isLoading: loadingItems, isError: errItems } = useQuery({
    queryKey: queryKeys.cashflow.pendingItems(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, name, quantity, purchase_price, status,
          supplier:suppliers(name),
          order:orders!inner(id, order_code, company_id)
        `)
        .in("status", ["da_ordinare", "ordinato"])
        .is("stock_item_id", null)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const pendingItems = useMemo(
    () => (pendingItemsRaw as Array<{ id: string }>).filter((i) => !idsGiaACosto.has(i.id)),
    [pendingItemsRaw, idsGiaACosto],
  );

  // Query supplier payment tracking (installments from order_items)
  const { data: supplierBalances = [], isLoading: loadingSupplierBalances, isError: errSupplierBalances } = useQuery({
    queryKey: queryKeys.cashflow.supplierBalances(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, name, purchase_price, quantity,
          balance_amount, balance_expected_date, balance_paid, balance_paid_date,
          deposit_amount, deposit_expected_date, deposit_paid, deposit_paid_date,
          is_paid, paid_date, payment_method,
          supplier:suppliers(name),
          order:orders!inner(id, order_code, company_id)
        `)
        .not("supplier_id", "is", null)
        .is("stock_item_id", null)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query costi aziendali non pagati
  const { data: companyCosts = [], isLoading: loadingCosts, isError: errCosts } = useQuery({
    queryKey: queryKeys.cashflow.companyCosts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_paid", false)
        .gte("due_date", costDateFrom)
        .order("due_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // === TREASURY: paid data queries ===

  // Paid company costs
  const { data: paidCompanyCosts = [], isLoading: loadingPaidCosts } = useQuery({
    queryKey: queryKeys.cashflow.treasuryPaidCosts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_paid", true)
        .order("paid_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Paid external teams
  const { data: paidExternalTeams = [], isLoading: loadingPaidTeams } = useQuery({
    queryKey: queryKeys.cashflow.treasuryPaidTeams(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select(`
          id, total_cost, paid_date, is_paid, vat_rate,
          order:orders!inner(id, order_code, company_id),
          external_team:external_teams(name)
        `)
        .eq("is_paid", true)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Paid commissions
  const { data: paidCommissions = [], isLoading: loadingPaidCommissions } = useQuery({
    queryKey: queryKeys.cashflow.treasuryPaidCommissions(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, commission_amount, deduction_amount, paid_date, is_paid,
          salesperson:salespeople!inner(first_name, last_name, company_id),
          order:orders!inner(id, order_code, company_id)
        `)
        .eq("is_paid", true)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Paid supplier items (order_items with supplier)
  const { data: paidSupplierItems = [], isLoading: loadingPaidSuppliers } = useQuery({
    queryKey: queryKeys.cashflow.treasuryPaidSuppliers(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, name, purchase_price, quantity,
          is_paid, paid_date,
          deposit_amount, deposit_paid, deposit_paid_date,
          balance_amount, balance_paid, balance_paid_date,
          payment_method,
          supplier:suppliers(name, is_foreign),
          order:orders!inner(id, order_code, company_id)
        `)
        .not("supplier_id", "is", null)
        .is("stock_item_id", null)
        .eq("order.company_id", companyId!)
        .limit(1000);
      if (error) throw error;
      // Filter only items with at least one payment made
      return (data || [])
        .filter((item: any) => item.is_paid || item.deposit_paid || item.balance_paid);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Active employees for salary calculation
  const { data: activeEmployees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: queryKeys.cashflow.treasuryEmployees(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, gross_salary, net_salary, role_type, is_active, created_at")
        .eq("company_id", companyId!)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Treasury categories
  const { data: treasuryCategories = [], isLoading: loadingTreasuryCategories } = useQuery({
    queryKey: queryKeys.cashflow.treasuryCategories(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treasury_categories")
        .select("*")
        .eq("company_id", companyId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Open scadenze (da_pagare, parziale) for forecast integration
  const { data: openScadenze = [], isLoading: loadingScadenze, isError: errScadenze } = useQuery({
    queryKey: queryKeys.cashflow.scadenze(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, tipo, direction, description, amount, paid_amount, due_date, status, supplier_id, order_id, suppliers(name), orders(order_code)")
        .eq("company_id", companyId!)
        .in("status", ["da_pagare", "parziale"])
        .lte("due_date", endDate)
        .order("due_date", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Aggregated cashflow summary via RPC (replaces heavy client-side stats + prima nota)
  const { data: cashflowSummary, isLoading: loadingSummary, isError: errSummary } = useQuery({
    queryKey: queryKeys.cashflow.summary(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cashflow_summary", {
        p_company_id: companyId!,
        p_months_ahead: 6,
      });
      if (error) throw error;
      return data as {
        primaNota: { entrate: number; uscite: number; saldo: number; entryCount: number };
        thisMonth: { income: number; expenses: number; net: number; incomeCount: number; expensesCount: number };
        nextMonth: { income: number; expenses: number; net: number };
        next3Months: { income: number; expenses: number; net: number };
        total: { income: number; expenses: number; net: number; incomeCount: number; expensesCount: number; commissionsTotal: number; costsTotal: number; supplierPaymentsTotal: number };
        monthlyForecast: Array<{ month: string; monthLabel: string; income: number; expense: number; net: number }>;
      };
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const isLoading = loadingOrders || loadingTeams || loadingItems || loadingCommissions || loadingCosts || loadingSupplierBalances || loadingPaidCosts || loadingPaidTeams || loadingPaidCommissions || loadingPaidSuppliers || loadingEmployees || loadingTreasuryCategories || loadingScadenze || loadingSummary;

  // Errore sui dati CORE (quelli che alimentano tab e KPI sempre visibili).
  // Prima la pagina non aveva alcuno stato d'errore per questi: se una query
  // falliva, restava un previsionale vuoto silenzioso.
  const isError = errOrders || errTeams || errCommissions || errItems || errSupplierBalances || errCosts || errScadenze || errSummary;

  // Backwards-compat: expose installmentsData as "orders" for treasury module
  const orders = installmentsData;


  // Entrate attese
  const expectedPayments = useMemo<ExpectedPayment[]>(() => {
    const payments: ExpectedPayment[] = [];
    installmentsData.forEach((inst: any) => {
      if (inst.is_paid || !inst.amount || Number(inst.amount) <= 0) return;
      const order = inst.order;
      const customerName = order?.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Cliente sconosciuto";

      payments.push({
        orderId: order?.id || inst.order_id,
        orderCode: order?.order_code || null,
        customerName,
        type: inst.label || inst.type || "Rata",
        amount: Number(inst.amount),
        expectedDate: inst.expected_date ? new Date(inst.expected_date) : null,
        direction: "in",
      });
    });
    return payments.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [installmentsData]);

  // Uscite attese (squadre esterne)
  const expectedExpenses = useMemo<ExpectedExpense[]>(() => {
    const expenses: ExpectedExpense[] = [];
    externalTeamPayments.forEach((payment) => {
      expenses.push({
        orderId: payment.order.id,
        orderCode: payment.order.order_code,
        teamName: payment.external_team?.name || "Squadra sconosciuta",
        amount: Number(payment.total_cost),
        expectedDate: payment.payment_date ? new Date(payment.payment_date) : null,
        isPaid: payment.is_paid,
        direction: "out",
      });
    });
    return expenses.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [externalTeamPayments]);

  // Provvigioni non pagate
  const expectedCommissions = useMemo<ExpectedCommission[]>(() => {
    const commissions: ExpectedCommission[] = [];
    unpaidCommissions.forEach((commission: any) => {
      commissions.push({
        orderId: commission.order.id,
        orderCode: commission.order.order_code,
        salespersonName:
          `${commission.salesperson?.first_name || ""} ${commission.salesperson?.last_name || ""}`.trim() ||
          "Venditore sconosciuto",
        amount: calculateStoredCommissionNet(commission.commission_amount, commission.deduction_amount),
        expectedDate: commission.payment_expected_date ? new Date(commission.payment_expected_date) : null,
        direction: "out",
      });
    });
    return commissions.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [unpaidCommissions]);

  // Costi aziendali elaborati
  const expectedCompanyCosts = useMemo<CompanyCostEntry[]>(() => {
    return companyCosts.map((cost: any): CompanyCostEntry => ({
      id: cost.id,
      name: cost.name,
      amount: Number(cost.amount),
      expectedDate: cost.due_date ? new Date(cost.due_date) : null,
      costType: cost.cost_type,
      category: cost.category,
      direction: "out",
      type: cost.cost_type === "fixed" ? "Costo Fisso" : "Costo Variabile",
    }));
  }, [companyCosts]);

  // Pagamenti fornitori attesi (da order_items con supplier)
  const expectedSupplierPayments = useMemo<ExpectedSupplierPayment[]>(() => {
    const payments: ExpectedSupplierPayment[] = [];
    supplierBalances.forEach((item: any) => {
      const supplierName = item.supplier?.name || "Fornitore sconosciuto";
      const totalCost = (Number(item.purchase_price) || 0) * (Number(item.quantity) || 1);
      const paymentMethod = item.payment_method;

      if (paymentMethod === "50_50" || paymentMethod === "30_70") {
        const depositPct = paymentMethod === "50_50" ? 0.5 : 0.3;
        const depositAmt = Number(item.deposit_amount) || totalCost * depositPct;
        const balanceAmt = Number(item.balance_amount) || totalCost - depositAmt;

        if (!item.deposit_paid) {
          payments.push({
            orderItemId: item.id,
            orderId: item.order.id,
            orderCode: item.order.order_code,
            supplierName,
            type: "Acconto Fornitore",
            amount: depositAmt,
            expectedDate: item.deposit_expected_date ? new Date(item.deposit_expected_date) : null,
            isPaid: false,
            direction: "out",
          });
        }
        if (item.deposit_paid && !item.balance_paid) {
          payments.push({
            orderItemId: item.id,
            orderId: item.order.id,
            orderCode: item.order.order_code,
            supplierName,
            type: "Saldo Fornitore",
            amount: balanceAmt,
            expectedDate: item.balance_expected_date ? new Date(item.balance_expected_date) : null,
            isPaid: false,
            direction: "out",
          });
        }
      } else {
        // Single payment methods (bonifico, riba, etc.)
        if (!item.is_paid && totalCost > 0) {
          payments.push({
            orderItemId: item.id,
            orderId: item.order.id,
            orderCode: item.order.order_code,
            supplierName,
            type: "Pagamento Fornitore",
            amount: totalCost,
            expectedDate: item.balance_expected_date ? new Date(item.balance_expected_date) : null,
            isPaid: false,
            direction: "out",
          });
        }
      }
    });
    return payments.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [supplierBalances]);


  // Stats from RPC (server-side aggregation replaces heavy client-side useMemo)
  const defaultPeriod = { income: 0, expenses: 0, net: 0 };
  const stats = useMemo<ForecastStats>(() => {
    if (!cashflowSummary) {
      return {
        thisMonth: { ...defaultPeriod, incomeCount: 0, expensesCount: 0 },
        nextMonth: defaultPeriod,
        next3Months: defaultPeriod,
        total: { ...defaultPeriod, incomeCount: 0, expensesCount: 0, commissionsTotal: 0, costsTotal: 0, supplierPaymentsTotal: 0 },
      };
    }
    return {
      thisMonth: {
        income: cashflowSummary.thisMonth.income,
        expenses: cashflowSummary.thisMonth.expenses,
        net: cashflowSummary.thisMonth.net,
        incomeCount: cashflowSummary.thisMonth.incomeCount,
        expensesCount: cashflowSummary.thisMonth.expensesCount,
      },
      nextMonth: {
        income: cashflowSummary.nextMonth.income,
        expenses: cashflowSummary.nextMonth.expenses,
        net: cashflowSummary.nextMonth.net,
      },
      next3Months: {
        income: cashflowSummary.next3Months.income,
        expenses: cashflowSummary.next3Months.expenses,
        net: cashflowSummary.next3Months.net,
      },
      total: {
        income: cashflowSummary.total.income,
        expenses: cashflowSummary.total.expenses,
        net: cashflowSummary.total.net,
        incomeCount: cashflowSummary.total.incomeCount,
        expensesCount: cashflowSummary.total.expensesCount,
        commissionsTotal: cashflowSummary.total.commissionsTotal,
        costsTotal: cashflowSummary.total.costsTotal,
        supplierPaymentsTotal: cashflowSummary.total.supplierPaymentsTotal,
      },
    };
  }, [cashflowSummary]);

  // Scadenze as forecast entries (not already covered by order_installments/company_costs)
  const scadenzeForForecast = useMemo(() => {
    // DEDUP entrate: per gli ordini che hanno un piano rate su DB l'incasso
    // e' GIA' in expectedPayments (order_installments non pagate) → senza
    // questo filtro la stessa entrata veniva contata DUE volte in bande
    // 30/60/90, transazioni e totali (verificato su prod: ordine con
    // scadenza incasso_cliente 5.100€ E rata 5.950€ entrambe sommate).
    const orderIdsWithInstallments = new Set(
      (installmentsData as Array<{ order_id?: string | null }>).map((i) => i.order_id).filter(Boolean),
    );
    return openScadenze.filter((s: any) =>
      !(s.direction === "entrata" && s.order_id && orderIdsWithInstallments.has(s.order_id)),
    ).map((s: any) => {
      const remaining = Number(s.amount) - Number(s.paid_amount || 0);
      return {
        id: s.id,
        description: s.description,
        amount: remaining,
        expectedDate: s.due_date ? new Date(s.due_date) : null,
        direction: s.direction as "entrata" | "uscita",
        tipo: s.tipo,
        supplierName: s.suppliers?.name || null,
        orderNumber: s.orders?.order_code || null,
        orderId: s.order_id,
      };
    }).filter((s: any) => s.amount > 0);
  }, [openScadenze, installmentsData]);

  const pn = cashflowSummary?.primaNota;

  // Le query sorgente hanno .limit(1000): se una torna esattamente 1000
  // righe la proiezione potrebbe essere PARZIALE — la pagina mostra un avviso.
  // Copre TUTTE le fonti previsionali (prima solo 3), altrimenti con >1000
  // righe di commissioni/articoli/costi la proiezione era parziale in silenzio.
  const dataTruncated = [
    installmentsData, externalTeamPayments, unpaidCommissions,
    pendingItems, supplierBalances, companyCosts, openScadenze,
  ].some((arr) => Array.isArray(arr) && arr.length >= 1000);

  return {
    isLoading,
    isError,
    dataTruncated,
    orders,
    expectedPayments,
    expectedExpenses,
    expectedCommissions,
    expectedSupplierPayments,
    expectedCompanyCosts,
    stats,
    // Treasury data
    paidCompanyCosts,
    paidExternalTeams,
    paidCommissions,
    paidSupplierItems,
    activeEmployees,
    treasuryCategories,
    companyId,
    // New: scadenze + prima nota (from RPC)
    scadenzeForForecast,
    primaNotaSaldo: pn
      ? { entrate: pn.entrate, uscite: pn.uscite, saldo: pn.saldo, entry_count: pn.entryCount }
      : { entrate: 0, uscite: 0, saldo: 0, entry_count: 0 },
    // Monthly forecast from RPC
    monthlyForecast: cashflowSummary?.monthlyForecast ?? [],
  };
}
