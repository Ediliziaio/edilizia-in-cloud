import { useMemo, useState, useCallback } from "react";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  subMonths,
  eachMonthOfInterval,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronRight, ChevronDown, CalendarIcon, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface TreasuryTabProps {
  orders: any[];
  paidCompanyCosts: any[];
  paidExternalTeams: any[];
  paidCommissions: any[];
  paidSupplierItems: any[];
  activeEmployees: any[];
  treasuryCategories: any[];
  companyId: string | undefined;
}

interface TreeNode {
  id: string;
  label: string;
  level: number;
  isExpandable: boolean;
  isIncome?: boolean;
  isSummaryRow?: boolean;
  monthlyAmounts: Record<string, number>;
  children: TreeNode[];
}

function DatePickerButton({
  date,
  onSelect,
  onClear,
  placeholder,
}: {
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  onClear: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1 text-xs font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {date ? format(date, "MMM yyyy", { locale: it }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onSelect}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      {date && (
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
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
}: TreasuryTabProps) {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => subMonths(startOfMonth(new Date()), 5));
  const [dateTo, setDateTo] = useState<Date | undefined>(() => endOfMonth(new Date()));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    new Set(["entrate", "uscite", "area-operativa"])
  );
  const [isInitializing, setIsInitializing] = useState(false);

  // Initialize default categories if none exist
  const initializeDefaultCategories = useCallback(async () => {
    if (!companyId || treasuryCategories.length > 0 || isInitializing) return;
    setIsInitializing(true);
    try {
      const defaults = [
        // Entrate
        { area: "entrate", name: "Da Incassi Ordini", is_income: true, position: 0 },
        // Uscite - Area Operativa
        { area: "operativa", name: "Costi Variabili", is_income: false, position: 0 },
        { area: "operativa", name: "Costi Fissi", is_income: false, position: 1 },
        // Uscite - Area Finanziaria
        { area: "finanziaria", name: "Oneri Finanziari", is_income: false, position: 0 },
        // Uscite - Area Fiscale
        { area: "fiscale", name: "Imposte e Tasse", is_income: false, position: 0 },
        // Uscite - Area Investimenti
        { area: "investimenti", name: "Investimenti", is_income: false, position: 0 },
        // Uscite - Area Equity
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

  // Auto-init
  useMemo(() => {
    if (companyId && treasuryCategories.length === 0 && !isInitializing) {
      initializeDefaultCategories();
    }
  }, [companyId, treasuryCategories.length, isInitializing]);

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

  // Helper: assign amount to month key
  const toMonthKey = (date: string | Date | null): string | null => {
    if (!date) return null;
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "yyyy-MM");
  };

  // Build monthly amounts for a set of items
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

  // Merge two monthly maps
  const mergeMonthly = (
    ...maps: Record<string, number>[]
  ): Record<string, number> => {
    const result: Record<string, number> = {};
    monthKeys.forEach((k) => {
      result[k] = maps.reduce((sum, m) => sum + (m[k] || 0), 0);
    });
    return result;
  };

  // === BUILD TREE DATA ===
  const treeData = useMemo(() => {
    // --- ENTRATE: pagamenti ordini già incassati ---
    const incomeItems: { date: string | Date | null; amount: number; label: string }[] = [];

    orders.forEach((order: any) => {
      if (order.deposit_paid && order.deposit_amount > 0) {
        incomeItems.push({
          date: order.deposit_paid_date,
          amount: Number(order.deposit_amount),
          label: "Acconto 1",
        });
      }
      if (order.deposit_2_paid && order.deposit_2_amount > 0) {
        incomeItems.push({
          date: order.deposit_2_paid_date,
          amount: Number(order.deposit_2_amount),
          label: "Acconto 2",
        });
      }
      if (order.balance_paid && order.balance_amount > 0) {
        incomeItems.push({
          date: order.balance_paid_date,
          amount: Number(order.balance_amount),
          label: "Saldo",
        });
      }
      if (order.financing_paid && order.financing_amount > 0) {
        incomeItems.push({
          date: order.financing_paid_date,
          amount: Number(order.financing_amount),
          label: "Finanziamento",
        });
      }
    });

    // Group income by type
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
        children: [],
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

    // Fornitori pagati (italiani vs esteri)
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

    // Manodopera esterna pagata
    const externalTeamItems = paidExternalTeams.map((t: any) => ({
      date: t.paid_date,
      amount: Number(t.total_cost),
    }));

    // Provvigioni pagate
    const commissionItems = paidCommissions.map((c: any) => ({
      date: c.paid_date,
      amount: Number(c.commission_amount),
    }));

    // Costi Variabili children
    const costiVariabiliChildren: TreeNode[] = [
      {
        id: "fornitori-italiani",
        label: "Fornitori Italia",
        level: 3,
        isExpandable: false,
        monthlyAmounts: buildMonthlyMap(supplierItemsItalian),
        children: [],
      },
      {
        id: "fornitori-esteri",
        label: "Fornitori Esteri",
        level: 3,
        isExpandable: false,
        monthlyAmounts: buildMonthlyMap(supplierItemsForeign),
        children: [],
      },
      {
        id: "manodopera-esterna",
        label: "Manodopera Esterna",
        level: 3,
        isExpandable: false,
        monthlyAmounts: buildMonthlyMap(externalTeamItems),
        children: [],
      },
      {
        id: "provvigioni",
        label: "Provvigioni",
        level: 3,
        isExpandable: false,
        monthlyAmounts: buildMonthlyMap(commissionItems),
        children: [],
      },
    ].filter((n) => Object.values(n.monthlyAmounts).some((v) => v > 0));

    const costiVariabiliMonthly = mergeMonthly(
      ...costiVariabiliChildren.map((c) => c.monthlyAmounts)
    );

    // Costi Fissi: stipendi + company_costs fissi pagati
    const salaryItems = activeEmployees.map((emp: any) => {
      // Each employee generates a monthly cost
      const monthlySalary = Number(emp.gross_salary) || 0;
      const items: { date: string | Date | null; amount: number }[] = [];
      months.forEach((m) => {
        items.push({ date: m, amount: monthlySalary });
      });
      return { name: `${emp.first_name} ${emp.last_name}`, items };
    });

    const stipendiMonthly: Record<string, number> = {};
    monthKeys.forEach((k) => (stipendiMonthly[k] = 0));
    salaryItems.forEach((emp) => {
      emp.items.forEach((item) => {
        const key = toMonthKey(item.date);
        if (key && key in stipendiMonthly) {
          stipendiMonthly[key] += item.amount;
        }
      });
    });

    const paidFixedCosts = paidCompanyCosts.filter(
      (c: any) => c.cost_type === "fixed"
    );
    const paidFixedItems = paidFixedCosts.map((c: any) => ({
      date: c.paid_date || c.due_date,
      amount: Number(c.amount),
    }));

    const costiFissiChildren: TreeNode[] = [
      {
        id: "stipendi",
        label: "Stipendi Lordi",
        level: 3,
        isExpandable: false,
        monthlyAmounts: stipendiMonthly,
        children: [],
      },
      {
        id: "costi-fissi-pagati",
        label: "Altri Costi Fissi",
        level: 3,
        isExpandable: false,
        monthlyAmounts: buildMonthlyMap(paidFixedItems),
        children: [],
      },
    ].filter((n) => Object.values(n.monthlyAmounts).some((v) => v > 0));

    const costiFissiMonthly = mergeMonthly(
      ...costiFissiChildren.map((c) => c.monthlyAmounts)
    );

    const areaOperativaChildren: TreeNode[] = [
      {
        id: "costi-variabili",
        label: "Costi Variabili",
        level: 2,
        isExpandable: true,
        monthlyAmounts: costiVariabiliMonthly,
        children: costiVariabiliChildren,
      },
      {
        id: "costi-fissi",
        label: "Costi Fissi",
        level: 2,
        isExpandable: true,
        monthlyAmounts: costiFissiMonthly,
        children: costiFissiChildren,
      },
    ];

    const areaOperativaMonthly = mergeMonthly(costiVariabiliMonthly, costiFissiMonthly);

    // Area Finanziaria, Fiscale, Investimenti, Equity from company_costs
    const buildAreaFromCosts = (
      areaId: string,
      areaLabel: string,
      filterFn: (c: any) => boolean
    ): TreeNode => {
      const filtered = paidCompanyCosts.filter(filterFn);
      const items = filtered.map((c: any) => ({
        date: c.paid_date || c.due_date,
        amount: Number(c.amount),
      }));
      return {
        id: `area-${areaId}`,
        label: areaLabel,
        level: 1,
        isExpandable: true,
        monthlyAmounts: buildMonthlyMap(items),
        children: filtered.length > 0
          ? [
              {
                id: `${areaId}-detail`,
                label: `Dettaglio ${areaLabel}`,
                level: 2,
                isExpandable: false,
                monthlyAmounts: buildMonthlyMap(items),
                children: [],
              },
            ]
          : [],
      };
    };

    const areaFinanziaria = buildAreaFromCosts(
      "finanziaria",
      "AREA FINANZIARIA",
      (c: any) => c.category === "finanziaria" || c.category === "bancarie" || c.category === "commissioni"
    );

    const areaFiscale = buildAreaFromCosts(
      "fiscale",
      "AREA FISCALE",
      (c: any) => c.category === "fiscale" || c.category === "iva" || c.category === "tasse"
    );

    const areaInvestimenti = buildAreaFromCosts(
      "investimenti",
      "AREA INVESTIMENTI",
      (c: any) => c.category === "investimenti"
    );

    const areaEquity = buildAreaFromCosts(
      "equity",
      "AREA EQUITY",
      (c: any) => c.category === "equity"
    );

    // Remaining paid variable costs not already categorized
    const paidVariableCosts = paidCompanyCosts.filter(
      (c: any) =>
        c.cost_type === "variable" &&
        !["finanziaria", "bancarie", "commissioni", "fiscale", "iva", "tasse", "investimenti", "equity"].includes(
          c.category || ""
        )
    );
    if (paidVariableCosts.length > 0) {
      const items = paidVariableCosts.map((c: any) => ({
        date: c.paid_date || c.due_date,
        amount: Number(c.amount),
      }));
      const altriVariabili: TreeNode = {
        id: "altri-variabili",
        label: "Altri Costi Variabili",
        level: 3,
        isExpandable: false,
        monthlyAmounts: buildMonthlyMap(items),
        children: [],
      };
      costiVariabiliChildren.push(altriVariabili);
      // Recalculate
      Object.keys(costiVariabiliMonthly).forEach((k) => {
        costiVariabiliMonthly[k] += altriVariabili.monthlyAmounts[k] || 0;
        areaOperativaMonthly[k] += altriVariabili.monthlyAmounts[k] || 0;
      });
    }

    const totalExpensesMonthly = mergeMonthly(
      areaOperativaMonthly,
      areaFinanziaria.monthlyAmounts,
      areaFiscale.monthlyAmounts,
      areaInvestimenti.monthlyAmounts,
      areaEquity.monthlyAmounts
    );

    const usciteNode: TreeNode = {
      id: "uscite",
      label: "Uscite",
      level: 0,
      isExpandable: true,
      monthlyAmounts: totalExpensesMonthly,
      children: [
        {
          id: "area-operativa",
          label: "AREA OPERATIVA",
          level: 1,
          isExpandable: true,
          monthlyAmounts: areaOperativaMonthly,
          children: areaOperativaChildren,
        },
        areaFinanziaria,
        areaFiscale,
        areaInvestimenti,
        areaEquity,
      ],
    };

    // Tesoreria a fine mese (cumulativo)
    const netMonthly: Record<string, number> = {};
    let cumulative = 0;
    monthKeys.forEach((k) => {
      cumulative += (totalIncomeMonthly[k] || 0) - (totalExpensesMonthly[k] || 0);
      netMonthly[k] = cumulative;
    });

    const startMonthly: Record<string, number> = {};
    let prevCumulative = 0;
    monthKeys.forEach((k) => {
      startMonthly[k] = prevCumulative;
      prevCumulative = netMonthly[k];
    });

    return { entrateNode, usciteNode, netMonthly, startMonthly };
  }, [orders, paidCompanyCosts, paidExternalTeams, paidCommissions, paidSupplierItems, activeEmployees, months, monthKeys]);

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
  const flattenTree = (nodes: TreeNode[]): TreeNode[] => {
    const result: TreeNode[] = [];
    const recurse = (node: TreeNode) => {
      result.push(node);
      if (node.isExpandable && expandedRows.has(node.id) && node.children.length > 0) {
        node.children.forEach(recurse);
      }
    };
    nodes.forEach(recurse);
    return result;
  };

  const visibleRows = useMemo(
    () => flattenTree([treeData.entrateNode, treeData.usciteNode]),
    [treeData, expandedRows]
  );

  const getRowStyle = (node: TreeNode) => {
    const isTopLevel = node.level === 0;
    const isArea = node.level === 1;

    if (isTopLevel && node.id === "entrate")
      return "bg-emerald-50 dark:bg-emerald-950/30 font-bold text-emerald-700 dark:text-emerald-400";
    if (isTopLevel && node.id === "uscite")
      return "bg-red-50 dark:bg-red-950/30 font-bold text-red-700 dark:text-red-400";
    if (isArea) return "bg-muted/50 font-semibold";
    if (node.level === 2) return "font-medium";
    return "";
  };

  const getAmountColor = (amount: number, isIncome?: boolean) => {
    if (amount === 0) return "text-muted-foreground";
    if (isIncome) return "text-emerald-600 dark:text-emerald-400";
    return "";
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
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
      </div>

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
                    <td
                      key={k}
                      className={cn(
                        "text-right p-3 tabular-nums",
                        treeData.startMonthly[k] >= 0
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatCurrency(treeData.startMonthly[k] || 0)}
                    </td>
                  ))}
                </tr>

                {/* Rows */}
                {visibleRows.map((node) => (
                  <tr
                    key={node.id}
                    className={cn("border-b transition-colors", getRowStyle(node))}
                  >
                    <td
                      className={cn(
                        "p-3 sticky left-0 z-10 cursor-default",
                        getRowStyle(node),
                        !getRowStyle(node) && "bg-background"
                      )}
                      style={{ paddingLeft: `${12 + node.level * 20}px` }}
                    >
                      <div className="flex items-center gap-1.5">
                        {node.isExpandable ? (
                          <button
                            onClick={() => toggleRow(node.id)}
                            className="p-0.5 rounded hover:bg-accent transition-colors"
                          >
                            {expandedRows.has(node.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        <span>{node.label}</span>
                      </div>
                    </td>
                    {monthKeys.map((k) => (
                      <td
                        key={k}
                        className={cn(
                          "text-right p-3 tabular-nums",
                          getAmountColor(node.monthlyAmounts[k] || 0, node.isIncome)
                        )}
                      >
                        {(node.monthlyAmounts[k] || 0) !== 0
                          ? formatCurrency(node.monthlyAmounts[k])
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Tesoreria a fine mese */}
                <tr className="border-t-2 border-primary bg-blue-50 dark:bg-blue-950/20 font-bold">
                  <td className="p-3 sticky left-0 bg-blue-50 dark:bg-blue-950/20 z-10">
                    Tesoreria a fine mese
                  </td>
                  {monthKeys.map((k) => (
                    <td
                      key={k}
                      className={cn(
                        "text-right p-3 tabular-nums",
                        (treeData.netMonthly[k] || 0) >= 0
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatCurrency(treeData.netMonthly[k] || 0)}
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
