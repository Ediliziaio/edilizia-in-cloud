import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  isSameMonth,
  addDays,
  format,
} from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  ExpectedPayment,
  ExpectedExpense,
  ExpectedCommission,
  ExpectedSupplierPayment,
  CompanyCostEntry,
  ExternalTeamPayment,
  MaterialCosts,
  ForecastStats,
  CfoKpis,
  CostsSummary,
  Supplier,
} from "@/lib/forecastTypes";

export function useCashFlowData() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // Query ordini con pagamenti non incassati
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["forecast-orders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, order_code,
          deposit_amount, deposit_paid, deposit_expected_date,
          deposit_2_amount, deposit_2_paid, deposit_2_expected_date,
          balance_amount, balance_paid, balance_expected_date,
          financing_amount, financing_paid, financing_expected_date,
          financing_cost, payment_type,
          customer:profiles!orders_customer_id_fkey(first_name, last_name)
        `)
        .eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Query squadre esterne non pagate
  const { data: externalTeamPayments = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["forecast-external-teams", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select(`
          id, total_cost, payment_date, is_paid,
          order:orders!inner(id, order_code, company_id),
          external_team:external_teams(name)
        `)
        .eq("is_paid", false);
      if (error) throw error;
      return (data as ExternalTeamPayment[]).filter((item) => item.order?.company_id === companyId);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
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
        .eq("is_paid", false);
      if (error) throw error;
      return (data || []).filter((item: any) => item.order?.company_id === companyId);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Query articoli da ordinare/ordinati
  const { data: pendingItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["forecast-pending-items", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, name, quantity, purchase_price, status,
          supplier:suppliers(name),
          order:orders!inner(id, order_code, company_id)
        `)
        .in("status", ["da_ordinare", "ordinato"])
        .is("stock_item_id", null);
      if (error) throw error;
      return (data || []).filter((item: any) => item.order?.company_id === companyId);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
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
          deposit_amount, deposit_paid, deposit_paid_date,
          is_paid, paid_date, payment_method,
          supplier:suppliers(name),
          order:orders!inner(id, order_code, company_id)
        `)
        .not("supplier_id", "is", null)
        .is("stock_item_id", null);
      if (error) throw error;
      return (data || []).filter((item: any) => item.order?.company_id === companyId);
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Query costi aziendali non pagati
  const { data: companyCosts = [], isLoading: loadingCosts } = useQuery({
    queryKey: ["forecast-company-costs", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_costs")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_paid", false)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingOrders || loadingTeams || loadingItems || loadingCommissions || loadingCosts || loadingSupplierBalances;

  // Fornitori unici
  const suppliers = useMemo<Supplier[]>(() => {
    const supplierMap = new Map<string, string>();
    pendingItems.forEach((item: any) => {
      if (item.supplier?.name) {
        supplierMap.set(item.supplier_id || item.supplier.name, item.supplier.name);
      }
    });
    return Array.from(supplierMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pendingItems]);

  // Entrate attese
  const expectedPayments = useMemo<ExpectedPayment[]>(() => {
    const payments: ExpectedPayment[] = [];
    orders.forEach((order) => {
      const customerName = order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Cliente sconosciuto";

      if (!order.deposit_paid && order.deposit_amount && order.deposit_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Acconto 1",
          amount: Number(order.deposit_amount),
          expectedDate: order.deposit_expected_date ? new Date(order.deposit_expected_date) : null,
          direction: "in",
        });
      }
      if (!order.deposit_2_paid && order.deposit_2_amount && order.deposit_2_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Acconto 2",
          amount: Number(order.deposit_2_amount),
          expectedDate: order.deposit_2_expected_date ? new Date(order.deposit_2_expected_date) : null,
          direction: "in",
        });
      }
      if (!order.balance_paid && order.balance_amount && order.balance_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Saldo",
          amount: Number(order.balance_amount),
          expectedDate: order.balance_expected_date ? new Date(order.balance_expected_date) : null,
          direction: "in",
        });
      }
      // Financing income
      const o = order as any;
      if (!o.financing_paid && o.financing_amount && o.financing_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Finanziamento",
          amount: Number(o.financing_amount),
          expectedDate: o.financing_expected_date ? new Date(o.financing_expected_date) : null,
          direction: "in",
        });
      }
    });
    return payments.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [orders]);

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
            expectedDate: item.deposit_paid_date ? new Date(item.deposit_paid_date) : null,
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

  // Project recurring costs into a future month
  const projectCostsForMonth = (monthDate: Date) => {
    let total = 0;
    companyCosts.forEach((cost: any) => {
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

  // CFO KPIs
  const cfoKpis = useMemo<CfoKpis>(() => {
    const now = new Date();
    const totalExpensesAll = stats.total.expenses;
    const totalIncomeAll = stats.total.income;
    const ratio = totalExpensesAll > 0 ? totalIncomeAll / totalExpensesAll : 0;
    const overdueCosts = expectedCompanyCosts.filter((c) => c.expectedDate && c.expectedDate < now);
    const overdueTotal = overdueCosts.reduce((s, c) => s + c.amount, 0);
    const monthlyRecurring = companyCosts
      .filter((c: any) => c.recurrence === "monthly")
      .reduce((s: number, c: any) => s + Number(c.amount), 0);
    const burnRate = totalExpensesAll > 0 ? totalExpensesAll / 6 : 0;
    return { ratio, overdueTotal, overdueCount: overdueCosts.length, monthlyRecurring, burnRate };
  }, [stats, expectedCompanyCosts, companyCosts]);

  // Chart data (6 mesi)
  const chartData = useMemo(() => {
    const now = new Date();
    let cumulative = 0;
    const months: any[] = [];

    for (let i = 0; i < 6; i++) {
      const monthDate = addMonths(now, i);
      const monthIncome = expectedPayments
        .filter((p) => p.expectedDate && isSameMonth(p.expectedDate, monthDate))
        .reduce((sum, p) => sum + p.amount, 0);
      const monthTeams = expectedExpenses
        .filter((e) => e.expectedDate && isSameMonth(e.expectedDate, monthDate))
        .reduce((sum, e) => sum + e.amount, 0);
      const monthCommissions = expectedCommissions
        .filter((c) => c.expectedDate && isSameMonth(c.expectedDate, monthDate))
        .reduce((sum, c) => sum + c.amount, 0);

      const monthFixedCosts = companyCosts
        .filter((c: any) => {
          if (c.cost_type !== "fixed") return false;
          const dueDate = new Date(c.due_date);
          if (c.recurrence === "monthly") return true;
          if (c.recurrence === "quarterly" && dueDate.getMonth() % 3 === monthDate.getMonth() % 3) return true;
          if (c.recurrence === "yearly" && dueDate.getMonth() === monthDate.getMonth()) return true;
          if (c.recurrence === "once" && isSameMonth(dueDate, monthDate)) return true;
          return false;
        })
        .reduce((s: number, c: any) => s + Number(c.amount), 0);

      const monthVariableCosts = companyCosts
        .filter((c: any) => {
          if (c.cost_type !== "variable") return false;
          const dueDate = new Date(c.due_date);
          if (c.recurrence === "monthly") return true;
          if (c.recurrence === "quarterly" && dueDate.getMonth() % 3 === monthDate.getMonth() % 3) return true;
          if (c.recurrence === "yearly" && dueDate.getMonth() === monthDate.getMonth()) return true;
          if (c.recurrence === "once" && isSameMonth(dueDate, monthDate)) return true;
          return false;
        })
        .reduce((s: number, c: any) => s + Number(c.amount), 0);

      const monthSupplier = expectedSupplierPayments
        .filter((p) => !p.isPaid && p.expectedDate && isSameMonth(p.expectedDate, monthDate))
        .reduce((sum, p) => sum + p.amount, 0);

      const totalOut = monthTeams + monthCommissions + monthFixedCosts + monthVariableCosts + monthSupplier;
      cumulative += monthIncome - totalOut;

      months.push({
        month: format(monthDate, "MMM yyyy", { locale: it }),
        Entrate: monthIncome,
        "Squadre Esterne": monthTeams,
        Provvigioni: monthCommissions,
        "Costi Fissi": monthFixedCosts,
        "Costi Variabili": monthVariableCosts,
        Fornitori: monthSupplier,
        Cumulativo: cumulative,
      });
    }
    return months;
  }, [expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, companyCosts]);

  // Costs summary
  const costsSummary = useMemo<CostsSummary>(() => {
    const now = new Date();
    const soon = addDays(now, 30);
    const upcoming = expectedCompanyCosts.filter((c) => c.expectedDate && c.expectedDate <= soon);
    const fixedTotal = expectedCompanyCosts.filter((c) => c.costType === "fixed").reduce((s, c) => s + c.amount, 0);
    const variableTotal = expectedCompanyCosts
      .filter((c) => c.costType === "variable")
      .reduce((s, c) => s + c.amount, 0);
    return { upcoming, fixedTotal, variableTotal };
  }, [expectedCompanyCosts]);

  // Material costs calculator (needs supplier filter applied externally)
  const getMaterialCosts = (supplierFilter: string): MaterialCosts => {
    let filtered = pendingItems;
    if (supplierFilter === "no-supplier") {
      filtered = pendingItems.filter((i: any) => !i.supplier);
    } else if (supplierFilter !== "all") {
      filtered = pendingItems.filter((i: any) => i.supplier?.name === supplierFilter);
    }

    const daOrdinare = filtered.filter((i: any) => i.status === "da_ordinare");
    const ordinati = filtered.filter((i: any) => i.status === "ordinato");

    return {
      toOrder: {
        count: daOrdinare.length,
        total: daOrdinare.reduce((sum: number, i: any) => sum + (i.purchase_price || 0) * (i.quantity || 1), 0),
        items: daOrdinare,
      },
      ordered: {
        count: ordinati.length,
        total: ordinati.reduce((sum: number, i: any) => sum + (i.purchase_price || 0) * (i.quantity || 1), 0),
        items: ordinati,
      },
    };
  };

  return {
    isLoading,
    expectedPayments,
    expectedExpenses,
    expectedCommissions,
    expectedSupplierPayments,
    expectedCompanyCosts,
    stats,
    cfoKpis,
    chartData,
    costsSummary,
    suppliers,
    pendingItems,
    getMaterialCosts,
  };
}
