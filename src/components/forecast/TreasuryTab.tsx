import { useMemo, useState, useCallback, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachMonthOfInterval,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronRight, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DatePickerButton } from "@/components/forecast/DatePickerButton";
import type {
  ExpectedPayment,
  ExpectedExpense,
  ExpectedCommission,
  ExpectedSupplierPayment,
  CompanyCostEntry,
} from "@/lib/forecastTypes";

interface TreasuryTabProps {
  orders: any[];
  paidCompanyCosts: any[];
  paidExternalTeams: any[];
  paidCommissions: any[];
  paidSupplierItems: any[];
  activeEmployees: any[];
  treasuryCategories: any[];
  companyId: string | undefined;
  // Forecast data
  expectedPayments: ExpectedPayment[];
  expectedExpenses: ExpectedExpense[];
  expectedCommissions: ExpectedCommission[];
  expectedSupplierPayments: ExpectedSupplierPayment[];
  expectedCompanyCosts: CompanyCostEntry[];
}

interface TreeNode {
  id: string;
  label: string;
  level: number;
  isExpandable: boolean;
  isIncome?: boolean;
  monthlyAmounts: Record<string, number>;
  children: TreeNode[];
}

export function TreasuryTab({
  orders,
  paidCompanyCosts,
  paidExternalTeams,
  paidCommissions,
  paidSupplierItems,
  activeEmployees,
  treasuryCategories,
  companyId,
  expectedPayments,
  expectedExpenses,
  expectedCommissions,
  expectedSupplierPayments,
  expectedCompanyCosts,
}: TreasuryTabProps) {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => subMonths(startOfMonth(new Date()), 5));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => endOfMonth(new Date()));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    new Set(["entrate", "uscite", "area-operativa"])
  );
  const [isInitializing, setIsInitializing] = useState(false);
  const [showForecast, setShowForecast] = useState(false);

  // Initialize default categories if none exist
  const initializeDefaultCategories = useCallback(async () => {
    if (!companyId || treasuryCategories.length > 0 || isInitializing) return;
    setIsInitializing(true);
    try {
      const defaults = [
        { area: "entrate", name: "Da Incassi Ordini", is_income: true, position: 0 },
        { area: "operativa", name: "Costi Variabili", is_income: false, position: 0 },
        { area: "operativa", name: "Costi Fissi", is_income: false, position: 1 },
        { area: "finanziaria", name: "Oneri Finanziari", is_income: false, position: 0 },
        { area: "fiscale", name: "Imposte e Tasse", is_income: false, position: 0 },
        { area: "investimenti", name: "Investimenti", is_income: false, position: 0 },
        { area: "equity", name: "Equity", is_income: false, position: 0 },
      ];
      const { error } = await supabase.from("treasury_categories").insert(
        defaults.map((d) => ({ ...d, company_id: companyId }))
      );
      if (!error) {
        queryClient.invalidateQueries({ queryKey: ["treasury-categories", companyId] });
      }
    } finally {
      setIsInitializing(false);
    }
  }, [companyId, treasuryCategories.length, isInitializing, queryClient]);

  useEffect(() => {
    if (companyId && treasuryCategories.length === 0 && !isInitializing) {
      initializeDefaultCategories();
    }
  }, [companyId, treasuryCategories.length, isInitializing, initializeDefaultCategories]);

  // Generate month columns
  const months = useMemo(() => {
    const from = dateFrom || subMonths(startOfMonth(new Date()), 5);
    const to = dateTo || endOfMonth(new Date());
    return eachMonthOfInterval({ start: startOfMonth(from), end: startOfMonth(to) });
  }, [dateFrom, dateTo]);

  const monthKeys = useMemo(
    () => months.map((m) => format(m, "yyyy-MM")),
    [months]
  );

  const toMonthKey = (date: string | Date | null): string | null => {
    if (!date) return null;
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "yyyy-MM");
  };

  const buildMonthlyMap = (
    items: { date: string | Date | null; amount: number }[]
  ): Record<string, number> => {
    const map: Record<string, number> = {};
    monthKeys.forEach((k) => (map[k] = 0));
    items.forEach((item) => {
      const key = toMonthKey(item.date);
      if (key && key in map) {
        map[key] += item.amount;
      }
    });
    return map;
  };

  const mergeMonthly = (
    ...maps: Record<string, number>[]
  ): Record<string, number> => {
    const result: Record<string, number> = {};
    monthKeys.forEach((k) => {
      result[k] = maps.reduce((sum, m) => sum + (m[k] || 0), 0);
    });
    return result;
  };

  // === BUILD ACTUAL (SOSTENUTO) TREE DATA ===
  const treeData = useMemo(() => {
    // --- ENTRATE: pagamenti ordini già incassati ---
    const incomeItems: { date: string | Date | null; amount: number; label: string }[] = [];

    orders.forEach((inst: any) => {
      if (!inst.is_paid || !inst.amount || Number(inst.amount) <= 0) return;
      const typeLabel = inst.label || inst.type || "Rata";
      incomeItems.push({
        date: inst.paid_date,
        amount: Number(inst.amount),
        label: typeLabel,
      });
    });

    const incomeByType: Record<string, { date: string | Date | null; amount: number }[]> = {};
    incomeItems.forEach((item) => {
      if (!incomeByType[item.label]) incomeByType[item.label] = [];
      incomeByType[item.label].push(item);
    });

    const incomeChildren: TreeNode[] = Object.entries(incomeByType).map(
      ([label, items]) => ({
        id: `income-${label}`,
        label,
        level: 2,
        isExpandable: false,
        isIncome: true,
        monthlyAmounts: buildMonthlyMap(items),
        children: [] as TreeNode[],
      })
    );

    const totalIncomeMonthly = buildMonthlyMap(incomeItems);

    const incomeNode: TreeNode = {
      id: "income-orders",
      label: "Da Incassi Ordini",
      level: 1,
      isExpandable: true,
      isIncome: true,
      monthlyAmounts: totalIncomeMonthly,
      children: incomeChildren,
    };

    const entrateNode: TreeNode = {
      id: "entrate",
      label: "Entrate",
      level: 0,
      isExpandable: true,
      isIncome: true,
      monthlyAmounts: totalIncomeMonthly,
      children: [incomeNode],
    };

    // --- USCITE ---
    const supplierItemsItalian: { date: string | Date | null; amount: number }[] = [];
    const supplierItemsForeign: { date: string | Date | null; amount: number }[] = [];

    paidSupplierItems.forEach((item: any) => {
      const isForeign = item.supplier?.is_foreign || false;
      const target = isForeign ? supplierItemsForeign : supplierItemsItalian;
      const totalCost = (Number(item.purchase_price) || 0) * (Number(item.quantity) || 1);

      if (item.is_paid && item.paid_date) {
        target.push({ date: item.paid_date, amount: totalCost });
      } else {
        if (item.deposit_paid && item.deposit_paid_date) {
          target.push({ date: item.deposit_paid_date, amount: Number(item.deposit_amount) || 0 });
        }
        if (item.balance_paid && item.balance_paid_date) {
          target.push({ date: item.balance_paid_date, amount: Number(item.balance_amount) || 0 });
        }
      }
    });

    const externalTeamItems = paidExternalTeams.map((t: any) => ({
      date: t.paid_date,
      amount: Number(t.total_cost),
    }));

    const commissionItems = paidCommissions.map((c: any) => ({
      date: c.paid_date,
      amount: Number(c.commission_amount),
    }));

    const costiVariabiliChildren: TreeNode[] = [
      { id: "fornitori-italiani", label: "Fornitori Italia", level: 3, isExpandable: false, monthlyAmounts: buildMonthlyMap(supplierItemsItalian), children: [] },
      { id: "fornitori-esteri", label: "Fornitori Esteri", level: 3, isExpandable: false, monthlyAmounts: buildMonthlyMap(supplierItemsForeign), children: [] },
      { id: "manodopera-esterna", label: "Manodopera Esterna", level: 3, isExpandable: false, monthlyAmounts: buildMonthlyMap(externalTeamItems), children: [] },
      { id: "provvigioni", label: "Provvigioni", level: 3, isExpandable: false, monthlyAmounts: buildMonthlyMap(commissionItems), children: [] },
    ].filter((n) => Object.values(n.monthlyAmounts).some((v) => v > 0));

    const costiVariabiliMonthly = mergeMonthly(...costiVariabiliChildren.map((c) => c.monthlyAmounts));

    const salaryItems = activeEmployees.map((emp: any) => {
      const monthlySalary = Number(emp.gross_salary) || 0;
      const items: { date: string | Date | null; amount: number }[] = [];
      months.forEach((m) => { items.push({ date: m, amount: monthlySalary }); });
      return { name: `${emp.first_name} ${emp.last_name}`, items };
    });

    const stipendiMonthly: Record<string, number> = {};
    monthKeys.forEach((k) => (stipendiMonthly[k] = 0));
    salaryItems.forEach((emp) => {
      emp.items.forEach((item) => {
        const key = toMonthKey(item.date);
        if (key && key in stipendiMonthly) stipendiMonthly[key] += item.amount;
      });
    });

    const paidFixedCosts = paidCompanyCosts.filter((c: any) => c.cost_type === "fixed");
    const paidFixedItems = paidFixedCosts.map((c: any) => ({ date: c.paid_date || c.due_date, amount: Number(c.amount) }));

    const costiFissiChildren: TreeNode[] = [
      { id: "stipendi", label: "Stipendi Lordi", level: 3, isExpandable: false, monthlyAmounts: stipendiMonthly, children: [] },
      { id: "costi-fissi-pagati", label: "Altri Costi Fissi", level: 3, isExpandable: false, monthlyAmounts: buildMonthlyMap(paidFixedItems), children: [] },
    ].filter((n) => Object.values(n.monthlyAmounts).some((v) => v > 0));

    const costiFissiMonthly = mergeMonthly(...costiFissiChildren.map((c) => c.monthlyAmounts));

    const areaOperativaChildren: TreeNode[] = [
      { id: "costi-variabili", label: "Costi Variabili", level: 2, isExpandable: true, monthlyAmounts: costiVariabiliMonthly, children: costiVariabiliChildren },
      { id: "costi-fissi", label: "Costi Fissi", level: 2, isExpandable: true, monthlyAmounts: costiFissiMonthly, children: costiFissiChildren },
    ];

    const areaOperativaMonthly = mergeMonthly(costiVariabiliMonthly, costiFissiMonthly);

    const buildAreaFromCosts = (areaId: string, areaLabel: string, filterFn: (c: any) => boolean): TreeNode => {
      const filtered = paidCompanyCosts.filter(filterFn);
      const items = filtered.map((c: any) => ({ date: c.paid_date || c.due_date, amount: Number(c.amount) }));
      return {
        id: `area-${areaId}`, label: areaLabel, level: 1, isExpandable: true,
        monthlyAmounts: buildMonthlyMap(items),
        children: filtered.length > 0
          ? [{ id: `${areaId}-detail`, label: `Dettaglio ${areaLabel}`, level: 2, isExpandable: false, monthlyAmounts: buildMonthlyMap(items), children: [] }]
          : [],
      };
    };

    const areaFinanziaria = buildAreaFromCosts("finanziaria", "AREA FINANZIARIA", (c: any) => c.category === "finanziaria" || c.category === "bancarie" || c.category === "commissioni");
    const areaFiscale = buildAreaFromCosts("fiscale", "AREA FISCALE", (c: any) => c.category === "fiscale" || c.category === "iva" || c.category === "tasse");
    const areaInvestimenti = buildAreaFromCosts("investimenti", "AREA INVESTIMENTI", (c: any) => c.category === "investimenti");
    const areaEquity = buildAreaFromCosts("equity", "AREA EQUITY", (c: any) => c.category === "equity");

    const paidVariableCosts = paidCompanyCosts.filter(
      (c: any) => c.cost_type === "variable" && !["finanziaria", "bancarie", "commissioni", "fiscale", "iva", "tasse", "investimenti", "equity"].includes(c.category || "")
    );
    if (paidVariableCosts.length > 0) {
      const items = paidVariableCosts.map((c: any) => ({ date: c.paid_date || c.due_date, amount: Number(c.amount) }));
      const altriVariabili: TreeNode = { id: "altri-variabili", label: "Altri Costi Variabili", level: 3, isExpandable: false, monthlyAmounts: buildMonthlyMap(items), children: [] };
      costiVariabiliChildren.push(altriVariabili);
      Object.keys(costiVariabiliMonthly).forEach((k) => {
        costiVariabiliMonthly[k] += altriVariabili.monthlyAmounts[k] || 0;
        areaOperativaMonthly[k] += altriVariabili.monthlyAmounts[k] || 0;
      });
    }

    const totalExpensesMonthly = mergeMonthly(
      areaOperativaMonthly, areaFinanziaria.monthlyAmounts, areaFiscale.monthlyAmounts, areaInvestimenti.monthlyAmounts, areaEquity.monthlyAmounts
    );

    const usciteNode: TreeNode = {
      id: "uscite", label: "Uscite", level: 0, isExpandable: true, monthlyAmounts: totalExpensesMonthly,
      children: [
        { id: "area-operativa", label: "AREA OPERATIVA", level: 1, isExpandable: true, monthlyAmounts: areaOperativaMonthly, children: areaOperativaChildren },
        areaFinanziaria, areaFiscale, areaInvestimenti, areaEquity,
      ],
    };

    // Cumulative treasury (actual)
    const netMonthly: Record<string, number> = {};
    let cumulative = 0;
    monthKeys.forEach((k) => {
      cumulative += (totalIncomeMonthly[k] || 0) - (totalExpensesMonthly[k] || 0);
      netMonthly[k] = Math.max(0, cumulative); // never below 0 for actual
    });

    const startMonthly: Record<string, number> = {};
    let prevCumulative = 0;
    monthKeys.forEach((k) => {
      startMonthly[k] = prevCumulative;
      prevCumulative = netMonthly[k];
    });

    return { entrateNode, usciteNode, netMonthly, startMonthly, totalIncomeMonthly, totalExpensesMonthly };
  }, [orders, paidCompanyCosts, paidExternalTeams, paidCommissions, paidSupplierItems, activeEmployees, months, monthKeys]);

  // === BUILD FORECAST TREE DATA ===
  const forecastData = useMemo(() => {
    // Forecast income: expected payments not yet collected
    const forecastIncomeItems = expectedPayments.map((p) => ({
      date: p.expectedDate,
      amount: p.amount,
    }));
    const forecastIncomeMonthly = buildMonthlyMap(forecastIncomeItems);

    // Forecast expenses: unpaid external teams
    const forecastExtTeamItems = expectedExpenses.filter((e) => !e.isPaid).map((e) => ({
      date: e.expectedDate,
      amount: e.amount,
    }));

    // Forecast commissions (unpaid)
    const forecastCommissionItems = expectedCommissions.map((c) => ({
      date: c.expectedDate,
      amount: c.amount,
    }));

    // Forecast supplier payments (unpaid)
    const forecastSupplierItems = expectedSupplierPayments.filter((s) => !s.isPaid).map((s) => ({
      date: s.expectedDate,
      amount: s.amount,
    }));

    // Forecast company costs (unpaid)
    const forecastCostItems = expectedCompanyCosts.map((c) => ({
      date: c.expectedDate,
      amount: c.amount,
    }));

    const forecastExpensesMonthly = mergeMonthly(
      buildMonthlyMap(forecastExtTeamItems),
      buildMonthlyMap(forecastCommissionItems),
      buildMonthlyMap(forecastSupplierItems),
      buildMonthlyMap(forecastCostItems),
    );

    const forecastNetMonthly: Record<string, number> = {};
    let forecastCum = 0;
    monthKeys.forEach((k) => {
      const actualIncome = treeData.totalIncomeMonthly[k] || 0;
      const actualExpenses = treeData.totalExpensesMonthly[k] || 0;
      const fIncome = forecastIncomeMonthly[k] || 0;
      const fExpenses = forecastExpensesMonthly[k] || 0;
      forecastCum += (actualIncome + fIncome) - (actualExpenses + fExpenses);
      forecastNetMonthly[k] = Math.max(0, forecastCum);
    });

    return { forecastIncomeMonthly, forecastExpensesMonthly, forecastNetMonthly };
  }, [expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts, monthKeys, treeData]);

  // Toggle expand/collapse
  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Flatten tree for rendering
  const visibleRows = useMemo(() => {
    const result: TreeNode[] = [];
    const recurse = (node: TreeNode) => {
      result.push(node);
      if (node.isExpandable && expandedRows.has(node.id) && node.children.length > 0) {
        node.children.forEach(recurse);
      }
    };
    [treeData.entrateNode, treeData.usciteNode].forEach(recurse);
    return result;
  }, [treeData, expandedRows]);

  const getRowStyle = (node: TreeNode) => {
    const isTopLevel = node.level === 0;
    const isArea = node.level === 1;
    if (isTopLevel && node.id === "entrate") return "bg-emerald-50 dark:bg-emerald-950/30 font-bold text-emerald-700 dark:text-emerald-400";
    if (isTopLevel && node.id === "uscite") return "bg-red-50 dark:bg-red-950/30 font-bold text-red-700 dark:text-red-400";
    if (isArea) return "bg-muted/50 font-semibold";
    if (node.level === 2) return "font-medium";
    return "";
  };

  const getAmountColor = (amount: number, isIncome?: boolean) => {
    if (amount === 0) return "text-muted-foreground";
    if (isIncome) return "text-emerald-600 dark:text-emerald-400";
    return "";
  };

  // Chart data with optional forecast overlay
  // Cumulative net balance line
  const cumulativeData = useMemo(() => {
    let cumSum = 0;
    const cumMap: Record<string, number> = {};
    monthKeys.forEach((k) => {
      const income = treeData.entrateNode.monthlyAmounts[k] || 0;
      const expenses = treeData.usciteNode.monthlyAmounts[k] || 0;
      cumSum += income - expenses;
      cumMap[k] = cumSum;
    });
    return cumMap;
  }, [monthKeys, treeData]);

  const chartData = useMemo(
    () =>
      monthKeys.map((k, i) => ({
        month: format(months[i], "MMM yy", { locale: it }),
        monthFull: format(months[i], "MMMM yyyy", { locale: it }),
        income: treeData.entrateNode.monthlyAmounts[k] || 0,
        expenses: treeData.usciteNode.monthlyAmounts[k] || 0,
        treasury: treeData.netMonthly[k] || 0,
        treasuryStart: treeData.startMonthly[k] || 0,
        forecastIncome: forecastData.forecastIncomeMonthly[k] || 0,
        forecastExpenses: forecastData.forecastExpensesMonthly[k] || 0,
        forecastTreasury: forecastData.forecastNetMonthly[k] || 0,
        cumulativeNet: cumulativeData[k] || 0,
      })),
    [monthKeys, months, treeData, forecastData, cumulativeData]
  );

  const lastMonthTreasury = monthKeys.length > 0 ? treeData.netMonthly[monthKeys[monthKeys.length - 1]] || 0 : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    const variation = data.income - data.expenses;
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md text-sm min-w-[220px]">
        <p className="font-semibold mb-2 text-base capitalize">{data.monthFull}</p>
        
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tesoreria</p>
        <div className="flex justify-between gap-4 mb-0.5">
          <span className="text-muted-foreground">Inizio</span>
          <span className="font-medium tabular-nums">{formatCurrency(data.treasuryStart)}</span>
        </div>
        <div className="flex justify-between gap-4 mb-0.5">
          <span className="text-muted-foreground">Fine</span>
          <span className="font-medium tabular-nums">{formatCurrency(data.treasury)}</span>
        </div>
        <div className="flex justify-between gap-4 mb-2">
          <span className="text-muted-foreground">Variazione</span>
          <span className={cn("font-medium tabular-nums", variation >= 0 ? "text-emerald-600" : "text-red-500")}>
            {variation >= 0 ? "+" : ""}{formatCurrency(variation)}
          </span>
        </div>

        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Entrate</p>
        <div className="flex justify-between gap-4 mb-0.5">
          <span className="text-muted-foreground">Realizzato</span>
          <span className="font-medium tabular-nums text-emerald-600">{formatCurrency(data.income)}</span>
        </div>
        {showForecast && (
          <div className="flex justify-between gap-4 mb-0.5">
            <span className="text-muted-foreground">Previsto</span>
            <span className="font-medium tabular-nums text-emerald-400">{formatCurrency(data.forecastIncome)}</span>
          </div>
        )}

        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 mt-2">Uscite</p>
        <div className="flex justify-between gap-4 mb-0.5">
          <span className="text-muted-foreground">Realizzato</span>
          <span className="font-medium tabular-nums text-red-500">{formatCurrency(data.expenses)}</span>
        </div>
        {showForecast && (
          <div className="flex justify-between gap-4 mb-0.5">
            <span className="text-muted-foreground">Previsto</span>
            <span className="font-medium tabular-nums text-red-400">{formatCurrency(data.forecastExpenses)}</span>
          </div>
        )}
        {showForecast && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 mt-2">Tesoreria Prevista</p>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Saldo</span>
              <span className="font-medium tabular-nums text-blue-400">{formatCurrency(data.forecastTreasury)}</span>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Saldo Finale Periodo */}
      {monthKeys.length > 0 && (() => {
        const lastKey = monthKeys[monthKeys.length - 1];
        const finalBalance = treeData.netMonthly[lastKey] || 0;
        return (
          <Card className={cn(
            "border-2",
            finalBalance >= 0
              ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20"
              : "border-destructive/50 bg-destructive/5"
          )}>
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Saldo Finale Periodo</p>
                <p className={cn(
                  "text-2xl font-bold tabular-nums",
                  finalBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                )}>
                  {formatCurrency(finalBalance)}
                </p>
              </div>
              <div className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                finalBalance >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-destructive/10"
              )}>
                {finalBalance >= 0
                  ? <ChevronRight className="h-5 w-5 text-emerald-600 rotate-[-90deg]" />
                  : <ChevronRight className="h-5 w-5 text-destructive rotate-90" />}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Period selector + Forecast toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Periodo:</span>
        <DatePickerButton
          date={dateFrom}
          onSelect={setDateFrom}
          onClear={() => setDateFrom(undefined)}
          placeholder="Da"
        />
        <span className="text-sm text-muted-foreground">—</span>
        <DatePickerButton
          date={dateTo}
          onSelect={setDateTo}
          onClear={() => setDateTo(undefined)}
          placeholder="A"
        />
        <div className="ml-auto">
          <Button
            variant={showForecast ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowForecast(!showForecast)}
          >
            {showForecast ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showForecast ? "Nascondi Previsionale" : "Mostra Previsionale"}
          </Button>
        </div>
      </div>

      {/* Treasury chart */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Andamento Tesoreria</h3>
            <div className="flex items-center gap-2">
              {showForecast && (
                <div className="px-3 py-1.5 rounded-lg text-sm font-bold tabular-nums bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-300 border border-dashed border-blue-300 dark:border-blue-700">
                  Prev: {formatCurrency(monthKeys.length > 0 ? forecastData.forecastNetMonthly[monthKeys[monthKeys.length - 1]] || 0 : 0)}
                </div>
              )}
              <div className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-bold tabular-nums",
                lastMonthTreasury >= 0
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                  : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              )}>
                Saldo: {formatCurrency(lastMonthTreasury)}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickFormatter={(v: number) => {
                  const abs = Math.abs(v);
                  return abs >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v);
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              {/* Actual bars */}
              <Bar dataKey="income" name="Entrate" fill="hsl(160, 84%, 39%)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Uscite" fill="hsl(0, 84%, 60%)" radius={[3, 3, 0, 0]} />
              {/* Forecast bars (semi-transparent) */}
              {showForecast && (
                <Bar dataKey="forecastIncome" name="Entrate Prev." fill="hsl(160, 84%, 39%)" fillOpacity={0.3} radius={[3, 3, 0, 0]} />
              )}
              {showForecast && (
                <Bar dataKey="forecastExpenses" name="Uscite Prev." fill="hsl(0, 84%, 60%)" fillOpacity={0.3} radius={[3, 3, 0, 0]} />
              )}
              {/* Actual treasury line */}
              <Line
                type="monotone"
                dataKey="treasury"
                name="Tesoreria"
                stroke="hsl(217, 91%, 60%)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "hsl(217, 91%, 60%)" }}
              />
              {/* Forecast treasury line (dashed) */}
              {showForecast && (
                <Line
                  type="monotone"
                  dataKey="forecastTreasury"
                  name="Tesoreria Prev."
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3, fill: "hsl(217, 91%, 60%)", strokeDasharray: "0" }}
                  strokeOpacity={0.5}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Treasury grid */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 min-w-[250px] sticky left-0 bg-muted/30 z-10">
                    Voce
                  </th>
                  {months.map((m) => (
                    <th
                      key={format(m, "yyyy-MM")}
                      className="text-right p-3 min-w-[110px] whitespace-nowrap"
                    >
                      {format(m, "MMM yy", { locale: it })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Tesoreria a inizio mese */}
                <tr className="border-b bg-blue-50 dark:bg-blue-950/20 font-bold">
                  <td className="p-3 sticky left-0 bg-blue-50 dark:bg-blue-950/20 z-10">
                    Tesoreria a inizio mese
                  </td>
                  {monthKeys.map((k) => (
                    <td key={k} className="text-right p-3 tabular-nums text-blue-600 dark:text-blue-400">
                      {formatCurrency(treeData.startMonthly[k] || 0)}
                    </td>
                  ))}
                </tr>

                {/* Rows */}
                {visibleRows.map((node) => (
                  <tr key={node.id} className={cn("border-b transition-colors", getRowStyle(node))}>
                    <td
                      className={cn("p-3 sticky left-0 z-10 cursor-default", getRowStyle(node), !getRowStyle(node) && "bg-background")}
                      style={{ paddingLeft: `${12 + node.level * 20}px` }}
                    >
                      <div className="flex items-center gap-1.5">
                        {node.isExpandable ? (
                          <button onClick={() => toggleRow(node.id)} className="p-0.5 rounded hover:bg-accent transition-colors">
                            {expandedRows.has(node.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        <span>{node.label}</span>
                      </div>
                    </td>
                    {monthKeys.map((k) => {
                      const actual = node.monthlyAmounts[k] || 0;
                      const hasForecast = showForecast && (node.id === "entrate" || node.id === "uscite");
                      const forecastVal = hasForecast
                        ? node.id === "entrate"
                          ? forecastData.forecastIncomeMonthly[k] || 0
                          : forecastData.forecastExpensesMonthly[k] || 0
                        : 0;

                      const cellColor = actual > 0
                        ? (node.isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
                        : actual < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground";

                      return (
                        <td key={k} className={cn("text-right p-3 tabular-nums", cellColor)}>
                          <div>
                            {actual !== 0 ? formatCurrency(actual) : "—"}
                            {hasForecast && forecastVal > 0 && (
                              <div className="text-xs text-muted-foreground italic mt-0.5">
                                Prev. {formatCurrency(forecastVal)}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Tesoreria a fine mese */}
                <tr className="border-t-2 border-primary bg-blue-50 dark:bg-blue-950/20 font-bold">
                  <td className="p-3 sticky left-0 bg-blue-50 dark:bg-blue-950/20 z-10">
                    Tesoreria a fine mese
                  </td>
                  {monthKeys.map((k) => (
                    <td key={k} className="text-right p-3 tabular-nums text-blue-600 dark:text-blue-400">
                      <div>
                        {formatCurrency(treeData.netMonthly[k] || 0)}
                        {showForecast && (
                          <div className="text-xs italic mt-0.5 text-blue-400 dark:text-blue-300">
                            Prev. {formatCurrency(forecastData.forecastNetMonthly[k] || 0)}
                          </div>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
