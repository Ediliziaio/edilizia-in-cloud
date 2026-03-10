import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  isSameMonth,
  format,
} from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import type {
  ExpectedPayment,
  ExpectedExpense,
  ExpectedCommission,
  ExpectedSupplierPayment,
  CompanyCostEntry,
  ExternalTeamPayment,
  ForecastStats,
} from "@/lib/forecastTypes";

export function useCashFlowData() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Query installments (rate dinamiche da order_installments con join su orders)
  const { data: installmentsData = [], isLoading: loadingOrders } = useQuery({
    queryKey: queryKeys.cashflow.installments(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_installments" as any)
        .select(`
          id, order_id, position, label, type, amount, is_paid, paid_date, expected_date,
          order:orders!inner(id, order_code, company_id, customer:profiles!orders_customer_id_fkey(first_name, last_name))
        `)
        .eq("order.company_id", companyId!)
        .order("position", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query squadre esterne non pagate
  const { data: externalTeamPayments = [], isLoading: loadingTeams } = useQuery({
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
        .limit(10000);
      if (error) throw error;
      return data as ExternalTeamPayment[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query provvigioni non pagate
  const { data: unpaidCommissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["forecast-unpaid-commissions", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, commission_amount, payment_expected_date, is_paid,
          salesperson:salespeople!inner(first_name, last_name, company_id),
          order:orders!inner(id, order_code, company_id)
        `)
        .eq("is_paid", false)
        .eq("order.company_id", companyId!)
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query articoli da ordinare/ordinati
  const { data: pendingItems = [], isLoading: loadingItems } = useQuery({
    queryKey: queryKeys.cashflow.all.concat(["pending-items", companyId]) as any,
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
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query supplier payment tracking (installments from order_items)
  const { data: supplierBalances = [], isLoading: loadingSupplierBalances } = useQuery({
    queryKey: ["forecast-supplier-balances", companyId],
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
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query costi aziendali non pagati
  const { data: companyCosts = [], isLoading: loadingCosts } = useQuery({
    queryKey: queryKeys.cashflow.companyCosts(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_paid", false)
        .order("due_date", { ascending: true })
        .limit(10000);
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
    queryKey: queryKeys.cashflow.treasury(companyId).concat(["paid-costs"]) as any,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_paid", true)
        .order("paid_date", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Paid external teams
  const { data: paidExternalTeams = [], isLoading: loadingPaidTeams } = useQuery({
    queryKey: queryKeys.cashflow.treasury(companyId).concat(["paid-teams"]) as any,
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
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Paid commissions
  const { data: paidCommissions = [], isLoading: loadingPaidCommissions } = useQuery({
    queryKey: queryKeys.cashflow.treasury(companyId).concat(["paid-commissions"]) as any,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, commission_amount, paid_date, is_paid,
          salesperson:salespeople!inner(first_name, last_name, company_id),
          order:orders!inner(id, order_code, company_id)
        `)
        .eq("is_paid", true)
        .eq("order.company_id", companyId!)
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Paid supplier items (order_items with supplier)
  const { data: paidSupplierItems = [], isLoading: loadingPaidSuppliers } = useQuery({
    queryKey: queryKeys.cashflow.treasury(companyId).concat(["paid-suppliers"]) as any,
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
        .limit(10000);
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
    queryKey: queryKeys.cashflow.treasury(companyId).concat(["employees"]) as any,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, gross_salary, net_salary, role_type, is_active")
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
    queryKey: queryKeys.cashflow.treasury(companyId).concat(["categories"]) as any,
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
  const { data: openScadenze = [], isLoading: loadingScadenze } = useQuery({
    queryKey: ["forecast-scadenze", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scadenze")
        .select("id, tipo, direction, description, amount, paid_amount, due_date, status, supplier_id, order_id, suppliers(name), orders(order_number)")
        .eq("company_id", companyId!)
        .in("status", ["da_pagare", "parziale"])
        .order("due_date", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Prima Nota saldo (current cash position)
  const { data: primaNotaSaldo, isLoading: loadingSaldo } = useQuery({
    queryKey: ["forecast-prima-nota-saldo", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_prima_nota_saldo", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data as { entrate: number; uscite: number; saldo: number; entry_count: number } | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const isLoading = loadingOrders || loadingTeams || loadingItems || loadingCommissions || loadingCosts || loadingSupplierBalances || loadingPaidCosts || loadingPaidTeams || loadingPaidCommissions || loadingPaidSuppliers || loadingEmployees || loadingTreasuryCategories || loadingScadenze || loadingSaldo;

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
        amount: Number(commission.commission_amount),
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

  // Project recurring costs into a future month, optionally filtered by cost_type
  const projectCostsForMonth = (monthDate: Date, costTypeFilter?: "fixed" | "variable") => {
    let total = 0;
    companyCosts.forEach((cost: any) => {
      if (costTypeFilter && cost.cost_type !== costTypeFilter) return;
      const dueDate = new Date(cost.due_date);
      if (cost.recurrence === "monthly") {
        total += Number(cost.amount);
      } else if (cost.recurrence === "quarterly" && dueDate.getMonth() % 3 === monthDate.getMonth() % 3) {
        total += Number(cost.amount);
      } else if (cost.recurrence === "yearly" && dueDate.getMonth() === monthDate.getMonth()) {
        total += Number(cost.amount);
      } else if (cost.recurrence === "once" && isSameMonth(dueDate, monthDate)) {
        total += Number(cost.amount);
      }
    });
    return total;
  };

  // Statistiche
  const stats = useMemo<ForecastStats>(() => {
    const now = new Date();
    const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
    const nextMonth = { start: startOfMonth(addMonths(now, 1)), end: endOfMonth(addMonths(now, 1)) };
    const next3Months = { start: startOfMonth(now), end: endOfMonth(addMonths(now, 2)) };

    const filterByInterval = <T extends { expectedDate: Date | null; amount: number }>(
      items: T[],
      interval: { start: Date; end: Date }
    ) => items.filter((i) => i.expectedDate && isWithinInterval(i.expectedDate, interval));

    const sumAmount = <T extends { amount: number }>(items: T[]) =>
      items.reduce((sum, i) => sum + i.amount, 0);

    const thisMonthIncome = sumAmount(filterByInterval(expectedPayments, thisMonth));
    const nextMonthIncome = sumAmount(filterByInterval(expectedPayments, nextMonth));
    const next3MonthsIncome = sumAmount(filterByInterval(expectedPayments, next3Months));
    const totalIncome = sumAmount(expectedPayments);

    const thisMonthExpenses = sumAmount(filterByInterval(expectedExpenses, thisMonth));
    const nextMonthExpenses = sumAmount(filterByInterval(expectedExpenses, nextMonth));
    const next3MonthsExpenses = sumAmount(filterByInterval(expectedExpenses, next3Months));
    const totalExpenses = sumAmount(expectedExpenses);

    const totalCommissions = sumAmount(expectedCommissions);
    const thisMonthCommissions = sumAmount(filterByInterval(expectedCommissions, thisMonth));
    const nextMonthCommissions = sumAmount(filterByInterval(expectedCommissions, nextMonth));
    const next3MonthsCommissions = sumAmount(filterByInterval(expectedCommissions, next3Months));

    const thisMonthCosts = sumAmount(filterByInterval(expectedCompanyCosts, thisMonth));
    const nextMonthCosts = projectCostsForMonth(addMonths(now, 1));
    const next3MonthsCosts =
      projectCostsForMonth(now) + projectCostsForMonth(addMonths(now, 1)) + projectCostsForMonth(addMonths(now, 2));
    const totalCosts = sumAmount(expectedCompanyCosts);

    // Supplier payments
    const unpaidSupplierPayments = expectedSupplierPayments.filter(p => !p.isPaid);
    const totalSupplierPayments = sumAmount(unpaidSupplierPayments);
    const thisMonthSupplier = sumAmount(filterByInterval(unpaidSupplierPayments, thisMonth));
    const nextMonthSupplier = sumAmount(filterByInterval(unpaidSupplierPayments, nextMonth));
    const next3MonthsSupplier = sumAmount(filterByInterval(unpaidSupplierPayments, next3Months));

    const totalAllExpenses = totalExpenses + totalCommissions + totalCosts + totalSupplierPayments;
    const thisMonthAllExpenses = thisMonthExpenses + thisMonthCommissions + thisMonthCosts + thisMonthSupplier;
    const nextMonthAllExpenses = nextMonthExpenses + nextMonthCommissions + nextMonthCosts + nextMonthSupplier;
    const next3MonthsAllExpenses = next3MonthsExpenses + next3MonthsCommissions + next3MonthsCosts + next3MonthsSupplier;

    return {
      thisMonth: {
        income: thisMonthIncome,
        expenses: thisMonthAllExpenses,
        net: thisMonthIncome - thisMonthAllExpenses,
        incomeCount: filterByInterval(expectedPayments, thisMonth).length,
        expensesCount:
          filterByInterval(expectedExpenses, thisMonth).length +
          filterByInterval(expectedCommissions, thisMonth).length +
          filterByInterval(expectedCompanyCosts, thisMonth).length +
          filterByInterval(unpaidSupplierPayments, thisMonth).length,
      },
      nextMonth: {
        income: nextMonthIncome,
        expenses: nextMonthAllExpenses,
        net: nextMonthIncome - nextMonthAllExpenses,
      },
      next3Months: {
        income: next3MonthsIncome,
        expenses: next3MonthsAllExpenses,
        net: next3MonthsIncome - next3MonthsAllExpenses,
      },
      total: {
        income: totalIncome,
        expenses: totalAllExpenses,
        net: totalIncome - totalAllExpenses,
        incomeCount: expectedPayments.length,
        expensesCount: expectedExpenses.length + expectedCommissions.length + expectedCompanyCosts.length + unpaidSupplierPayments.length,
        commissionsTotal: totalCommissions,
        costsTotal: totalCosts,
        supplierPaymentsTotal: totalSupplierPayments,
      },
    };
  }, [expectedPayments, expectedExpenses, expectedCommissions, expectedCompanyCosts, expectedSupplierPayments, companyCosts]);

  // Scadenze as forecast entries (not already covered by order_installments/company_costs)
  const scadenzeForForecast = useMemo(() => {
    return openScadenze.map((s: any) => {
      const remaining = Number(s.amount) - Number(s.paid_amount || 0);
      return {
        id: s.id,
        description: s.description,
        amount: remaining,
        expectedDate: s.due_date ? new Date(s.due_date) : null,
        direction: s.direction as "entrata" | "uscita",
        tipo: s.tipo,
        supplierName: s.suppliers?.name || null,
        orderNumber: s.orders?.order_number || null,
        orderId: s.order_id,
      };
    }).filter((s: any) => s.amount > 0);
  }, [openScadenze]);

  return {
    isLoading,
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
    // New: scadenze + prima nota
    scadenzeForForecast,
    primaNotaSaldo: primaNotaSaldo || { entrate: 0, uscite: 0, saldo: 0, entry_count: 0 },
  };
}
