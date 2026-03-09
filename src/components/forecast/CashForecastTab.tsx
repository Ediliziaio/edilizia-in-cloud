import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { format, addMonths, startOfMonth, endOfMonth, isWithinInterval, startOfDay, startOfYear, startOfWeek, endOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/useTableSort";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { WaterfallChart } from "@/components/forecast/WaterfallChart";
import { CashFlowForecast306090 } from "@/components/forecast/CashFlowForecast306090";
import type { ForecastStats, ExpectedPayment, ExpectedExpense, ExpectedCommission, ExpectedSupplierPayment, CompanyCostEntry } from "@/lib/forecastTypes";

interface ScadenzaForecastEntry {
  id: string;
  description: string;
  amount: number;
  expectedDate: Date | null;
  direction: "entrata" | "uscita";
  tipo: string;
  supplierName: string | null;
  orderNumber: string | null;
  orderId: string | null;
}

interface CashForecastTabProps {
  stats: ForecastStats;
  expectedPayments: ExpectedPayment[];
  expectedExpenses: ExpectedExpense[];
  expectedCommissions: ExpectedCommission[];
  expectedSupplierPayments: ExpectedSupplierPayment[];
  expectedCompanyCosts: CompanyCostEntry[];
  scadenzeForForecast?: ScadenzaForecastEntry[];
  primaNotaSaldo?: { entrate: number; uscite: number; saldo: number; entry_count: number };
}

type FilterCategory = "all" | "income" | "expenses";

interface UnifiedTransaction {
  date: Date | null;
  description: string;
  orderCode: string | null;
  category: string;
  amount: number;
  direction: "in" | "out";
  orderId: string | null;
}

export function CashForecastTab({ stats, expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts }: CashForecastTabProps) {
  const navigate = useNavigate();
  const now = new Date();
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [customMonths, setCustomMonths] = useState(3);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [activePreset, setActivePreset] = useState<string>("all");
  const [customPopoverOpen, setCustomPopoverOpen] = useState(false);

  const thisMonthEnd = endOfMonth(now);

  // Calculate custom period stats from raw data
  const customPeriodStats = useMemo(() => {
    const start = startOfMonth(addMonths(now, 1));
    const end = endOfMonth(addMonths(now, customMonths));
    const inRange = (d: Date | null) => d && isWithinInterval(d, { start, end });

    const income = expectedPayments.filter(p => inRange(p.expectedDate)).reduce((s, p) => s + p.amount, 0);
    const expExternal = expectedExpenses.filter(e => !e.isPaid && inRange(e.expectedDate)).reduce((s, e) => s + e.amount, 0);
    const expCommissions = expectedCommissions.filter(c => inRange(c.expectedDate)).reduce((s, c) => s + c.amount, 0);
    const expSupplier = expectedSupplierPayments.filter(p => !p.isPaid && inRange(p.expectedDate)).reduce((s, p) => s + p.amount, 0);
    const expCosts = expectedCompanyCosts.filter(c => inRange(c.expectedDate)).reduce((s, c) => s + c.amount, 0);

    const expenses = expExternal + expCommissions + expSupplier + expCosts;
    return { income, expenses, net: income - expenses };
  }, [customMonths, expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts]);

  // Preset logic
  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    switch (preset) {
      case "thisMonth":
        setDateFrom(startOfMonth(now));
        setDateTo(thisMonthEnd);
        break;
      case "nextQuarter":
        setDateFrom(startOfMonth(addMonths(now, 1)));
        setDateTo(endOfMonth(addMonths(now, 3)));
        break;
      case "thisYear":
        setDateFrom(startOfYear(now));
        setDateTo(thisMonthEnd);
        break;
      case "all":
        setDateFrom(undefined);
        setDateTo(undefined);
        break;
      case "custom":
        setCustomPopoverOpen(true);
        break;
    }
  };

  const handleRangeSelect = (range: import("react-day-picker").DateRange | undefined) => {
    setDateFrom(range?.from);
    setDateTo(range?.to);
    if (range?.from && range?.to) {
      setCustomPopoverOpen(false);
    }
  };

  const transactions = useMemo<UnifiedTransaction[]>(() => {
    const items: UnifiedTransaction[] = [];

    expectedPayments.forEach(p => items.push({ date: p.expectedDate, description: p.customerName, orderCode: p.orderCode, category: p.type, amount: p.amount, direction: "in", orderId: p.orderId }));
    expectedExpenses.forEach(e => items.push({ date: e.expectedDate, description: e.teamName, orderCode: e.orderCode, category: "Squadra Esterna", amount: e.amount, direction: "out", orderId: e.orderId }));
    expectedCommissions.forEach(c => items.push({ date: c.expectedDate, description: c.salespersonName, orderCode: c.orderCode, category: "Provvigione", amount: c.amount, direction: "out", orderId: c.orderId }));
    expectedSupplierPayments.filter(p => !p.isPaid).forEach(s => items.push({ date: s.expectedDate, description: s.supplierName, orderCode: s.orderCode, category: s.type, amount: s.amount, direction: "out", orderId: s.orderId }));
    expectedCompanyCosts.forEach(c => items.push({ date: c.expectedDate, description: c.name, orderCode: null, category: c.type, amount: c.amount, direction: "out", orderId: null }));

    return items
      .filter(t => filter === "all" || (filter === "income" ? t.direction === "in" : t.direction === "out"))
      .filter(t => {
        if (!dateFrom && !dateTo) return true;
        if (!t.date) return true;
        if (dateFrom && t.date < startOfDay(dateFrom)) return false;
        if (dateTo && t.date > endOfMonth(dateTo)) return false;
        return true;
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.getTime() - b.date.getTime();
      });
  }, [expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts, filter, dateFrom, dateTo]);

  const txAccessors = useMemo(() => ({
    date: (t: UnifiedTransaction) => t.date,
    description: (t: UnifiedTransaction) => t.description,
    orderCode: (t: UnifiedTransaction) => t.orderCode || "",
    category: (t: UnifiedTransaction) => t.category,
    amount: (t: UnifiedTransaction) => t.direction === "in" ? t.amount : -t.amount,
  }), []);

  const { sortConfig: txSort, toggleSort: toggleTxSort, sortedItems: sortedTransactions } = useTableSort(transactions, txAccessors);

  const { paginatedItems: paginatedTx, currentPage, totalPages, pageSize, totalItems, setPage, setPageSize } = usePagination(sortedTransactions);

  const cumulativeNet = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (t.direction === "in" ? t.amount : -t.amount), 0);
  }, [transactions]);

  // Weekly cumulative chart data
  const weeklyChartData = useMemo(() => {
    const txWithDate = transactions.filter(t => t.date !== null) as (UnifiedTransaction & { date: Date })[];
    if (txWithDate.length === 0) return [];

    // Group by week
    const weekMap = new Map<string, { weekLabel: string; income: number; expenses: number }>();
    txWithDate.forEach(t => {
      const ws = startOfWeek(t.date, { weekStartsOn: 1 });
      const key = ws.toISOString();
      if (!weekMap.has(key)) {
        weekMap.set(key, { weekLabel: format(ws, "dd MMM", { locale: it }), income: 0, expenses: 0 });
      }
      const entry = weekMap.get(key)!;
      if (t.direction === "in") {
        entry.income += t.amount;
      } else {
        entry.expenses += t.amount;
      }
    });

    // Build cumulative
    const sorted = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    let running = 0;
    return sorted.map(([, v]) => {
      const net = v.income - v.expenses;
      running += net;
      return {
        week: v.weekLabel,
        saldo: Math.round(running),
        income: Math.round(v.income),
        expenses: Math.round(v.expenses),
        net: Math.round(net),
        cumulative: Math.round(running),
      };
    });
  }, [transactions]);

  // Cash flow alert threshold
  const CASH_FLOW_WARNING_THRESHOLD = 5000;

  return (
    <div className="space-y-6">
      {/* Cash Flow Alerts */}
      {stats.nextMonth.net < 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Attenzione: Cash Flow Negativo</AlertTitle>
          <AlertDescription>
            Il saldo previsto per il prossimo mese è di {formatCurrency(stats.nextMonth.net)}. Verifica le uscite programmate e valuta azioni correttive.
          </AlertDescription>
        </Alert>
      )}
      {stats.nextMonth.net >= 0 && stats.nextMonth.net < CASH_FLOW_WARNING_THRESHOLD && (
        <Alert className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cash flow vicino allo zero</AlertTitle>
          <AlertDescription>
            Il saldo previsto per il prossimo mese è di soli {formatCurrency(stats.nextMonth.net)}. Monitora attentamente le entrate e le uscite.
          </AlertDescription>
        </Alert>
      )}

      {/* Cumulative balance hero card */}
      <Card className={cn(
        "border",
        cumulativeNet >= 0
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
      )}>
        <CardContent className="pt-6 pb-4">
          <p className="text-sm font-medium text-muted-foreground">Saldo Cumulativo Periodo</p>
          <p className={cn("text-3xl font-bold tabular-nums", cumulativeNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {formatCurrency(cumulativeNet)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Alla fine del periodo il saldo previsto sarà {cumulativeNet >= 0 ? "positivo" : "negativo"}
          </p>
        </CardContent>
      </Card>

      {/* Cumulative Cash Flow AreaChart */}
      {weeklyChartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash Flow Cumulativo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cfPositive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cfNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value: number) => [formatCurrency(value), "Saldo"]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="saldo"
                    stroke="hsl(142 76% 36%)"
                    strokeWidth={2}
                    fill="url(#cfPositive)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Waterfall Chart */}
      {weeklyChartData.length > 1 && <WaterfallChart data={weeklyChartData} />}

      {/* Net Cash Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NetCard title="Questo mese" income={stats.thisMonth.income} expenses={stats.thisMonth.expenses} net={stats.thisMonth.net} />
        <NetCard title="Prossimo mese" income={stats.nextMonth.income} expenses={stats.nextMonth.expenses} net={stats.nextMonth.net} />
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {customMonths === 1 ? "Prossimo mese" : `Prossimi ${customMonths} mesi`}
              </p>
              <Select value={String(customMonths)} onValueChange={(v) => setCustomMonths(Number(v))}>
                <SelectTrigger className="w-[80px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                    <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "mese" : "mesi"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Entrate</span>
              <span className="text-emerald-600 font-medium">{formatCurrency(customPeriodStats.income)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Uscite</span>
              <span className="text-red-600 font-medium">{formatCurrency(customPeriodStats.expenses)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="text-sm font-medium">Netto</span>
              <span className={`text-lg font-bold ${customPeriodStats.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(customPeriodStats.net)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Unified Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <CardTitle className="text-lg">Tutti i movimenti previsti</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex flex-wrap items-center border rounded-md">
                {([
                  { key: "thisMonth", label: "Questo mese" },
                  { key: "nextQuarter", label: "Prossimo trimestre" },
                  { key: "thisYear", label: "Quest'anno" },
                  { key: "all", label: "Tutto" },
                ] as const).map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={activePreset === key ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs rounded-none first:rounded-l-md last:rounded-r-md"
                    onClick={() => applyPreset(key)}
                  >
                    {label}
                  </Button>
                ))}
                <Popover open={customPopoverOpen} onOpenChange={setCustomPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={activePreset === "custom" ? "default" : "ghost"}
                      size="sm"
                      className="h-8 text-xs rounded-none rounded-r-md"
                      onClick={() => { setActivePreset("custom"); setCustomPopoverOpen(true); }}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                      {activePreset === "custom" && dateFrom && dateTo
                        ? `${format(dateFrom, "dd MMM", { locale: it })} – ${format(dateTo, "dd MMM", { locale: it })}`
                        : "Personalizzato"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateFrom && dateTo ? { from: dateFrom, to: dateTo } : dateFrom ? { from: dateFrom } : undefined}
                      onSelect={handleRangeSelect}
                      numberOfMonths={2}
                      locale={it}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {/* Category filter */}
              <Select value={filter} onValueChange={(v) => setFilter(v as FilterCategory)}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="income">Solo entrate</SelectItem>
                  <SelectItem value="expenses">Solo uscite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nessun movimento previsto</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead column="date" label="Data" sortConfig={txSort} onSort={toggleTxSort} />
                    <SortableTableHead column="description" label="Descrizione" sortConfig={txSort} onSort={toggleTxSort} />
                    <SortableTableHead column="orderCode" label="Ordine" sortConfig={txSort} onSort={toggleTxSort} />
                    <SortableTableHead column="category" label="Categoria" sortConfig={txSort} onSort={toggleTxSort} />
                    <SortableTableHead column="amount" label="Importo" sortConfig={txSort} onSort={toggleTxSort} className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTx.map((t, i) => (
                    <TableRow
                      key={i}
                      className={t.orderId ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => t.orderId && navigate(`/azienda/ordini/${t.orderId}`)}
                    >
                      <TableCell className="text-sm">{t.date ? format(t.date, "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell className="text-sm">{t.description}</TableCell>
                      <TableCell className="text-sm">{t.orderCode || "—"}</TableCell>
                      <TableCell className="text-sm">{t.category}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${t.direction === "in" ? "text-emerald-600" : "text-red-600"}`}>
                        {t.direction === "in" ? "+" : "−"}{formatCurrency(t.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NetCard({ title, income, expenses, net }: { title: string; income: number; expenses: number; net: number }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Entrate</span>
          <span className="text-emerald-600 font-medium">{formatCurrency(income)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Uscite</span>
          <span className="text-red-600 font-medium">{formatCurrency(expenses)}</span>
        </div>
        <div className="border-t pt-2 flex justify-between">
          <span className="text-sm font-medium">Netto</span>
          <span className={`text-lg font-bold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatCurrency(net)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
