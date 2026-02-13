import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { 
  format, 
  addMonths, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval,
  isSameMonth,
  isAfter,
  isBefore,
  addDays
} from "date-fns";
import { it } from "date-fns/locale";
import { 
  CalendarClock, 
  TrendingUp, 
  TrendingDown,
  Wallet, 
  PiggyBank,
  Calendar,
  Building2,
  Package,
  ShoppingCart,
  UserCheck,
  Receipt,
  AlertCircle,
  Download,
  Printer,
  Flame,
  ArrowLeftRight,
  Clock,
  Repeat,
} from "lucide-react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DateRangeFilter } from "@/components/orders/DateRangeFilter";
import { formatCurrency } from "@/lib/formatters";
import { ChevronDown } from "lucide-react";

interface ExpectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: "Acconto 1" | "Acconto 2" | "Saldo";
  amount: number;
  expectedDate: Date | null;
  direction: "in";
}

interface ExpectedExpense {
  orderId: string;
  orderCode: string | null;
  teamName: string;
  amount: number;
  expectedDate: Date | null;
  isPaid: boolean;
  direction: "out";
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface ExpectedCommission {
  orderId: string;
  orderCode: string | null;
  salespersonName: string;
  amount: number;
  expectedDate: Date | null;
  direction: "out";
}

interface CompanyCostEntry {
  id: string;
  name: string;
  amount: number;
  expectedDate: Date | null;
  costType: string;
  category: string | null;
  direction: "out";
  type: "Costo Fisso" | "Costo Variabile";
}

interface ExternalTeamPayment {
  id: string;
  total_cost: number;
  payment_date: string | null;
  is_paid: boolean;
  order: {
    id: string;
    order_code: string | null;
    company_id: string;
  };
  external_team: {
    name: string;
  } | null;
}

export default function CashFlowForecast() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [activeTab, setActiveTab] = useState<"all" | "income" | "expenses">("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  

  // Query ordini con pagamenti non incassati
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["forecast-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          deposit_amount,
          deposit_paid,
          deposit_expected_date,
          deposit_2_amount,
          deposit_2_paid,
          deposit_2_expected_date,
          balance_amount,
          balance_paid,
          balance_expected_date,
          customer:profiles!orders_customer_id_fkey(first_name, last_name)
        `);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Query squadre esterne non pagate
  const { data: externalTeamPayments = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["forecast-external-teams", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select(`
          id,
          total_cost,
          payment_date,
          is_paid,
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

  // Query articoli da ordinare/ordinati (costi materiali)
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
        .in("status", ["da_ordinare", "ordinato"]);
      
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
        .eq("is_paid", false)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Estrai lista fornitori unici
  const suppliers = useMemo(() => {
    const supplierMap = new Map<string, string>();
    pendingItems.forEach((item: any) => {
      if (item.supplier?.name) {
        supplierMap.set(item.supplier_id || item.supplier.name, item.supplier.name);
      }
    });
    return Array.from(supplierMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pendingItems]);

  // Filtra articoli per fornitore
  const filteredPendingItems = useMemo(() => {
    if (supplierFilter === "all") return pendingItems;
    if (supplierFilter === "no-supplier") return pendingItems.filter((i: any) => !i.supplier);
    return pendingItems.filter((i: any) => i.supplier?.name === supplierFilter);
  }, [pendingItems, supplierFilter]);

  // Calcola costi materiali (filtrati)
  const materialCosts = useMemo(() => {
    const daOrdinare = filteredPendingItems.filter((i: any) => i.status === "da_ordinare");
    const ordinati = filteredPendingItems.filter((i: any) => i.status === "ordinato");
    
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
  }, [filteredPendingItems]);

  const isLoading = loadingOrders || loadingTeams || loadingItems || loadingCommissions || loadingCosts;

  // Elabora entrate attese (pagamenti clienti)
  const expectedPayments = useMemo(() => {
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
    });

    return payments.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [orders]);

  // Elabora uscite attese (pagamenti squadre esterne)
  const expectedExpenses = useMemo(() => {
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

  // Elabora provvigioni non pagate
  const expectedCommissions = useMemo(() => {
    const commissions: ExpectedCommission[] = [];

    unpaidCommissions.forEach((commission: any) => {
      commissions.push({
        orderId: commission.order.id,
        orderCode: commission.order.order_code,
        salespersonName: `${commission.salesperson?.first_name || ""} ${commission.salesperson?.last_name || ""}`.trim() || "Venditore sconosciuto",
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

  // Elabora costi aziendali non pagati
  const expectedCompanyCosts = useMemo(() => {
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

  // Helper: project recurring costs into a future month
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

  // Calcola statistiche
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
    const nextMonth = { 
      start: startOfMonth(addMonths(now, 1)), 
      end: endOfMonth(addMonths(now, 1)) 
    };
    const next3Months = { 
      start: startOfMonth(now), 
      end: endOfMonth(addMonths(now, 2)) 
    };

    // Incassi
    const thisMonthIncome = expectedPayments
      .filter((p) => p.expectedDate && isWithinInterval(p.expectedDate, thisMonth))
      .reduce((sum, p) => sum + p.amount, 0);
    const nextMonthIncome = expectedPayments
      .filter((p) => p.expectedDate && isWithinInterval(p.expectedDate, nextMonth))
      .reduce((sum, p) => sum + p.amount, 0);
    const next3MonthsIncome = expectedPayments
      .filter((p) => p.expectedDate && isWithinInterval(p.expectedDate, next3Months))
      .reduce((sum, p) => sum + p.amount, 0);
    const totalIncome = expectedPayments.reduce((sum, p) => sum + p.amount, 0);

    // Uscite (squadre esterne)
    const thisMonthExpenses = expectedExpenses
      .filter((e) => e.expectedDate && isWithinInterval(e.expectedDate, thisMonth))
      .reduce((sum, e) => sum + e.amount, 0);
    const nextMonthExpenses = expectedExpenses
      .filter((e) => e.expectedDate && isWithinInterval(e.expectedDate, nextMonth))
      .reduce((sum, e) => sum + e.amount, 0);
    const next3MonthsExpenses = expectedExpenses
      .filter((e) => e.expectedDate && isWithinInterval(e.expectedDate, next3Months))
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = expectedExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Provvigioni venditori
    const totalCommissions = expectedCommissions.reduce((sum, c) => sum + c.amount, 0);
    const thisMonthCommissions = expectedCommissions
      .filter((c) => c.expectedDate && isWithinInterval(c.expectedDate, thisMonth))
      .reduce((sum, c) => sum + c.amount, 0);
    const nextMonthCommissions = expectedCommissions
      .filter((c) => c.expectedDate && isWithinInterval(c.expectedDate, nextMonth))
      .reduce((sum, c) => sum + c.amount, 0);
    const next3MonthsCommissions = expectedCommissions
      .filter((c) => c.expectedDate && isWithinInterval(c.expectedDate, next3Months))
      .reduce((sum, c) => sum + c.amount, 0);

    // Costi aziendali
    const thisMonthCosts = expectedCompanyCosts
      .filter((c) => c.expectedDate && isWithinInterval(c.expectedDate, thisMonth))
      .reduce((sum, c) => sum + c.amount, 0);
    const nextMonthCosts = projectCostsForMonth(addMonths(now, 1));
    const next3MonthsCosts = projectCostsForMonth(now) + projectCostsForMonth(addMonths(now, 1)) + projectCostsForMonth(addMonths(now, 2));
    const totalCosts = expectedCompanyCosts.reduce((sum, c) => sum + c.amount, 0);

    // Totale uscite = squadre esterne + provvigioni + costi aziendali
    const totalAllExpenses = totalExpenses + totalCommissions + totalCosts;
    const thisMonthAllExpenses = thisMonthExpenses + thisMonthCommissions + thisMonthCosts;
    const nextMonthAllExpenses = nextMonthExpenses + nextMonthCommissions + nextMonthCosts;
    const next3MonthsAllExpenses = next3MonthsExpenses + next3MonthsCommissions + next3MonthsCosts;

    return {
      thisMonth: {
        income: thisMonthIncome,
        expenses: thisMonthAllExpenses,
        net: thisMonthIncome - thisMonthAllExpenses,
        incomeCount: expectedPayments.filter((p) => p.expectedDate && isWithinInterval(p.expectedDate, thisMonth)).length,
        expensesCount: expectedExpenses.filter((e) => e.expectedDate && isWithinInterval(e.expectedDate, thisMonth)).length 
          + expectedCommissions.filter((c) => c.expectedDate && isWithinInterval(c.expectedDate, thisMonth)).length
          + expectedCompanyCosts.filter((c) => c.expectedDate && isWithinInterval(c.expectedDate, thisMonth)).length,
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
        expensesCount: expectedExpenses.length + expectedCommissions.length + expectedCompanyCosts.length,
        commissionsTotal: totalCommissions,
        costsTotal: totalCosts,
      },
    };
  }, [expectedPayments, expectedExpenses, expectedCommissions, expectedCompanyCosts, companyCosts]);

  // CFO KPIs
  const cfoKpis = useMemo(() => {
    const now = new Date();
    const totalExpensesAll = stats.total.expenses;
    const totalIncomeAll = stats.total.income;
    const ratio = totalExpensesAll > 0 ? totalIncomeAll / totalExpensesAll : 0;
    const overdueCosts = expectedCompanyCosts.filter(
      (c) => c.expectedDate && c.expectedDate < now
    );
    const overdueTotal = overdueCosts.reduce((s, c) => s + c.amount, 0);
    const monthlyRecurring = companyCosts
      .filter((c: any) => c.recurrence === "monthly")
      .reduce((s: number, c: any) => s + Number(c.amount), 0);
    // Burn rate: average monthly expenses over the 6-month forecast
    const burnRate = totalExpensesAll > 0 ? totalExpensesAll / 6 : 0;

    return { ratio, overdueTotal, overdueCount: overdueCosts.length, monthlyRecurring, burnRate };
  }, [stats, expectedCompanyCosts, companyCosts]);

  // Prepara dati per grafico (prossimi 6 mesi) con breakdown e netto cumulativo
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

      const totalOut = monthTeams + monthCommissions + monthFixedCosts + monthVariableCosts;
      cumulative += monthIncome - totalOut;

      months.push({
        month: format(monthDate, "MMM yyyy", { locale: it }),
        Entrate: monthIncome,
        "Squadre Esterne": monthTeams,
        Provvigioni: monthCommissions,
        "Costi Fissi": monthFixedCosts,
        "Costi Variabili": monthVariableCosts,
        Cumulativo: cumulative,
      });
    }

    return months;
  }, [expectedPayments, expectedExpenses, expectedCommissions, companyCosts]);

  // Export CSV
  const exportCSV = () => {
    const rows = [["Data", "Tipo", "Descrizione", "Ordine", "Direzione", "Importo"]];
    allTransactions.forEach((t: any) => {
      rows.push([
        t.expectedDate ? format(t.expectedDate, "dd/MM/yyyy") : "",
        t.type || (t.direction === "in" ? "Pagamento" : "Uscita"),
        t.customerName || t.teamName || t.name || "",
        t.orderCode || "",
        t.direction === "in" ? "Entrata" : "Uscita",
        String(t.amount),
      ]);
    });
    // Add summary
    rows.unshift(
      ["RIEPILOGO PREVISIONALE", "", "", "", "", ""],
      ["Totale Entrate", "", "", "", "", String(stats.total.income)],
      ["Totale Uscite", "", "", "", "", String(stats.total.expenses)],
      ["Saldo Netto", "", "", "", "", String(stats.total.net)],
      ["", "", "", "", "", ""],
    );
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `previsionale-cassa-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    window.print();
  };

  // Combina e filtra pagamenti per tabella
  const allTransactions = useMemo(() => {
    const combined = [
      ...expectedPayments.map((p) => ({ ...p, direction: "in" as const })),
      ...expectedExpenses.map((e) => ({ ...e, type: "Squadra Esterna" as const, direction: "out" as const })),
      ...expectedCompanyCosts.map((c) => ({
        orderId: c.id,
        orderCode: null,
        expectedDate: c.expectedDate,
        amount: c.amount,
        direction: "out" as const,
        type: c.type,
        teamName: c.name,
        customerName: c.name,
        costCategory: c.category,
      })),
    ];

    return combined.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [expectedPayments, expectedExpenses, expectedCompanyCosts]);

  // Filtra per tab e date
  const filteredTransactions = useMemo(() => {
    let filtered = allTransactions;

    if (activeTab === "income") {
      filtered = filtered.filter((t) => t.direction === "in");
    } else if (activeTab === "expenses") {
      filtered = filtered.filter((t) => t.direction === "out");
    }

    if (dateRange.from || dateRange.to) {
      filtered = filtered.filter((t) => {
        if (!t.expectedDate) return false;
        const matchesFrom = !dateRange.from || !isBefore(t.expectedDate, dateRange.from);
        const matchesTo = !dateRange.to || !isAfter(t.expectedDate, dateRange.to);
        return matchesFrom && matchesTo;
      });
    }

    return filtered;
  }, [allTransactions, activeTab, dateRange]);

  const transactionsWithoutDate = allTransactions.filter((t) => !t.expectedDate);

  // Costs summary for section
  const costsSummary = useMemo(() => {
    const now = new Date();
    const soon = addDays(now, 30);
    const upcoming = expectedCompanyCosts.filter(
      (c) => c.expectedDate && c.expectedDate <= soon
    );
    const fixedTotal = expectedCompanyCosts
      .filter((c) => c.costType === "fixed")
      .reduce((s, c) => s + c.amount, 0);
    const variableTotal = expectedCompanyCosts
      .filter((c) => c.costType === "variable")
      .reduce((s, c) => s + c.amount, 0);
    return { upcoming, fixedTotal, variableTotal };
  }, [expectedCompanyCosts]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }




  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:mb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Previsionale Cassa</h1>
          <p className="text-muted-foreground">
            Analizza entrate e uscite previste, inclusi costi aziendali
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1">
            <Download className="h-4 w-4" />
            Esporta CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="gap-1">
            <Printer className="h-4 w-4" />
            Stampa PDF
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Questo Mese</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.thisMonth.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.thisMonth.net >= 0 ? "+" : ""}{formatCurrency(stats.thisMonth.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.thisMonth.incomeCount} entrate, {stats.thisMonth.expensesCount} uscite
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prossimo Mese</CardTitle>
            {stats.nextMonth.net >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.nextMonth.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.nextMonth.net >= 0 ? "+" : ""}{formatCurrency(stats.nextMonth.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              Entrate {formatCurrency(stats.nextMonth.income)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prossimi 3 Mesi</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.next3Months.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.next3Months.net >= 0 ? "+" : ""}{formatCurrency(stats.next3Months.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              Uscite previste {formatCurrency(stats.next3Months.expenses)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale in Sospeso</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.total.net >= 0 ? "text-green-600" : "text-destructive"}`}>
              {stats.total.net >= 0 ? "+" : ""}{formatCurrency(stats.total.net)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.total.incomeCount} entrate, {stats.total.expensesCount} uscite
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CFO KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Burn Rate Mensile</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(cfoKpis.burnRate)}
            </div>
            <p className="text-xs text-muted-foreground">Media uscite/mese (6 mesi)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rapporto Entrate/Uscite</CardTitle>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cfoKpis.ratio >= 1 ? "text-green-600" : "text-destructive"}`}>
              {cfoKpis.ratio.toFixed(2)}x
            </div>
            <p className="text-xs text-muted-foreground">
              {cfoKpis.ratio >= 1 ? "Entrate superiori" : "Uscite superiori"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costi Scaduti</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${cfoKpis.overdueTotal > 0 ? "text-destructive" : "text-green-600"}`}>
              {formatCurrency(cfoKpis.overdueTotal)}
            </div>
            <p className="text-xs text-muted-foreground">{cfoKpis.overdueCount} costi non pagati</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ricorrenti Mensili</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(cfoKpis.monthlyRecurring)}
            </div>
            <p className="text-xs text-muted-foreground">Costi fissi mensili</p>
          </CardContent>
        </Card>
      </div>


      {(pendingItems.length > 0) && (
        <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 dark:border-orange-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-orange-600" />
                  Uscite Materiali Previste
                </CardTitle>
                <CardDescription>
                  Costi articoli da acquistare o già ordinati
                </CardDescription>
              </div>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[200px] bg-background">
                  <SelectValue placeholder="Filtra per fornitore" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i fornitori</SelectItem>
                  <SelectItem value="no-supplier">Senza fornitore</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.name}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Collapsible>
                <div className="p-4 rounded-lg bg-background border">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-medium">Da Ordinare</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <p className="text-2xl font-bold text-orange-600 mt-2">
                    {formatCurrency(materialCosts.toOrder.total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {materialCosts.toOrder.count} articoli
                  </p>
                  <CollapsibleContent className="mt-3 pt-3 border-t space-y-1">
                    {materialCosts.toOrder.items.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{item.name}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {formatCurrency((item.purchase_price || 0) * (item.quantity || 1))}
                        </span>
                      </div>
                    ))}
                    {materialCosts.toOrder.count > 5 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        +{materialCosts.toOrder.count - 5} altri articoli
                      </p>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
              
              <Collapsible>
                <div className="p-4 rounded-lg bg-background border">
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium">Ordinati (in arrivo)</span>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </div>
                  </CollapsibleTrigger>
                  <p className="text-2xl font-bold text-blue-600 mt-2">
                    {formatCurrency(materialCosts.ordered.total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {materialCosts.ordered.count} articoli
                  </p>
                  <CollapsibleContent className="mt-3 pt-3 border-t space-y-1">
                    {materialCosts.ordered.items.slice(0, 5).map((item: any) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{item.name}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {formatCurrency((item.purchase_price || 0) * (item.quantity || 1))}
                        </span>
                      </div>
                    ))}
                    {materialCosts.ordered.count > 5 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        +{materialCosts.ordered.count - 5} altri articoli
                      </p>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
              
              <div className="p-4 rounded-lg bg-background border-2 border-orange-300 dark:border-orange-700">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="h-4 w-4 text-orange-700" />
                  <span className="text-sm font-medium">Totale Impegni</span>
                </div>
                <p className="text-2xl font-bold text-orange-700">
                  {formatCurrency(materialCosts.toOrder.total + materialCosts.ordered.total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {materialCosts.toOrder.count + materialCosts.ordered.count} articoli totali
                </p>
                {supplierFilter !== "all" && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Filtro: {supplierFilter === "no-supplier" ? "Senza fornitore" : supplierFilter}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sezione Provvigioni Venditori */}
      {expectedCommissions.length > 0 && (
        <Card className="border-violet-200 bg-violet-50/50 dark:bg-violet-900/10 dark:border-violet-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-violet-600" />
              Provvigioni da Pagare
            </CardTitle>
            <CardDescription>
              Provvigioni venditori non ancora pagate
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venditore</TableHead>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Data Prevista</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expectedCommissions.slice(0, 5).map((commission, index) => (
                    <TableRow key={`commission-${commission.orderId}-${index}`}>
                      <TableCell className="font-medium">{commission.salespersonName}</TableCell>
                      <TableCell>
                        <Link 
                          to={`/azienda/ordini/${commission.orderId}`}
                          className="text-primary hover:underline"
                        >
                          {commission.orderCode || "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {commission.expectedDate 
                          ? format(commission.expectedDate, "dd/MM/yyyy", { locale: it })
                          : <span className="text-muted-foreground italic">Non definita</span>
                        }
                      </TableCell>
                      <TableCell className="text-right font-medium text-violet-600">
                        {formatCurrency(commission.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {expectedCommissions.length > 5 && (
              <p className="text-sm text-muted-foreground mt-2">
                +{expectedCommissions.length - 5} altre provvigioni
              </p>
            )}
            <div className="mt-4 p-3 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-between">
              <span className="font-medium">Totale Provvigioni</span>
              <span className="text-xl font-bold text-violet-700 dark:text-violet-400">
                {formatCurrency((stats.total as any).commissionsTotal || 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sezione Costi Aziendali */}
      <Card className="border-red-200 bg-red-50/50 dark:bg-red-900/10 dark:border-red-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-red-600" />
                Costi Aziendali
              </CardTitle>
              <CardDescription>
                Costi fissi e variabili non ancora pagati
              </CardDescription>
            </div>
            <Button variant="outline" asChild className="gap-1">
              <Link to="/azienda/costi">
                <Building2 className="h-4 w-4" />
                Gestisci Costi
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-background border">
              <span className="text-sm text-muted-foreground">Costi Fissi da pagare</span>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(costsSummary.fixedTotal)}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-background border">
              <span className="text-sm text-muted-foreground">Costi Variabili da pagare</span>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(costsSummary.variableTotal)}
              </p>
            </div>
          </div>

          {costsSummary.upcoming.length > 0 && (
            <div className="rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Costo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Scadenza</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costsSummary.upcoming.slice(0, 5).map((cost) => (
                    <TableRow key={cost.id}>
                      <TableCell className="font-medium">{cost.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cost.costType === "fixed" ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"}>
                          {cost.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cost.expectedDate
                          ? format(cost.expectedDate, "dd/MM/yyyy", { locale: it })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        {formatCurrency(cost.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {costsSummary.upcoming.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Nessun costo in scadenza nei prossimi 30 giorni
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grafico Timeline */}
      <Card className="print:break-before-page">
        <CardHeader>
          <CardTitle>Timeline Flusso di Cassa</CardTitle>
          <CardDescription>Previsione entrate e uscite per i prossimi 6 mesi con netto cumulativo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar dataKey="Entrate" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Squadre Esterne" stackId="expenses" fill="hsl(0 84.2% 60.2%)" />
                <Bar dataKey="Provvigioni" stackId="expenses" fill="hsl(262 83.3% 57.8%)" />
                <Bar dataKey="Costi Fissi" stackId="expenses" fill="hsl(20 90% 55%)" />
                <Bar dataKey="Costi Variabili" stackId="expenses" fill="hsl(40 90% 55%)" radius={[4, 4, 0, 0]} />
                <Line 
                  type="monotone" 
                  dataKey="Cumulativo" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3} 
                  dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                  name="Netto Cumulativo"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabella Dettaglio */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Dettaglio Movimenti</CardTitle>
              <CardDescription>Entrate e uscite non ancora registrate</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="all">Tutti</TabsTrigger>
                  <TabsTrigger value="income">Entrate</TabsTrigger>
                  <TabsTrigger value="expenses">Uscite</TabsTrigger>
                </TabsList>
              </Tabs>
              <DateRangeFilter
                label="Filtra per data"
                range={dateRange}
                onRangeChange={setDateRange}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessun movimento nel periodo selezionato</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Prevista</TableHead>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction, index) => (
                    <TableRow key={`${transaction.orderId}-${transaction.direction}-${index}`}>
                      <TableCell>
                        {transaction.expectedDate 
                          ? format(transaction.expectedDate, "dd/MM/yyyy", { locale: it })
                          : <span className="text-muted-foreground italic">Non definita</span>
                        }
                      </TableCell>
                      <TableCell>
                        {transaction.type === "Costo Fisso" || transaction.type === "Costo Variabile" ? (
                          "—"
                        ) : (
                          <Link 
                            to={`/azienda/ordini/${transaction.orderId}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {transaction.orderCode || "—"}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        {transaction.direction === "in" 
                          ? (transaction as any).customerName
                          : (transaction as any).teamName || (transaction as any).name
                        }
                      </TableCell>
                      <TableCell>
                        {transaction.direction === "in" ? (
                          <Badge 
                            variant="outline"
                            className={
                              transaction.type === "Saldo" 
                                ? "border-green-500 text-green-700" 
                                : transaction.type === "Acconto 2"
                                ? "border-blue-500 text-blue-700"
                                : "border-orange-500 text-orange-700"
                            }
                          >
                            {transaction.type}
                          </Badge>
                        ) : transaction.type === "Costo Fisso" ? (
                          <Badge variant="outline" className="border-red-400 text-red-600 gap-1">
                            <Receipt className="h-3 w-3" />
                            Costo Fisso
                          </Badge>
                        ) : transaction.type === "Costo Variabile" ? (
                          <Badge variant="outline" className="border-amber-400 text-amber-600 gap-1">
                            <Receipt className="h-3 w-3" />
                            Costo Variabile
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-destructive text-destructive gap-1">
                            <Building2 className="h-3 w-3" />
                            Squadra Esterna
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        transaction.direction === "in" ? "text-green-600" : "text-destructive"
                      }`}>
                        {transaction.direction === "in" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sezione Movimenti Senza Data */}
      {transactionsWithoutDate.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Movimenti senza data prevista
            </CardTitle>
            <CardDescription>
              Questi movimenti non hanno una data prevista
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsWithoutDate.map((transaction, index) => (
                    <TableRow key={`no-date-${transaction.orderId}-${transaction.direction}-${index}`}>
                      <TableCell>
                        {transaction.type === "Costo Fisso" || transaction.type === "Costo Variabile" ? (
                          "—"
                        ) : (
                          <Link 
                            to={`/azienda/ordini/${transaction.orderId}`}
                            className="text-primary hover:underline font-medium"
                          >
                            {transaction.orderCode || "—"}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        {transaction.direction === "in" 
                          ? (transaction as any).customerName
                          : (transaction as any).teamName || (transaction as any).name
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {transaction.direction === "in" ? transaction.type : transaction.type || "Squadra Esterna"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        transaction.direction === "in" ? "text-green-600" : "text-destructive"
                      }`}>
                        {transaction.direction === "in" ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
