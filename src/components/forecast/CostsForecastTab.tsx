import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { format, startOfMonth, endOfMonth, addMonths, isWithinInterval, startOfDay, startOfYear, eachMonthOfInterval } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort, type SortConfig } from "@/hooks/useTableSort";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { ExpectedExpense, ExpectedCommission, ExpectedSupplierPayment, CompanyCostEntry } from "@/lib/forecastTypes";

interface CostsForecastTabProps {
  expectedExpenses: ExpectedExpense[];
  expectedCommissions: ExpectedCommission[];
  expectedSupplierPayments: ExpectedSupplierPayment[];
  expectedCompanyCosts: CompanyCostEntry[];
}

export function CostsForecastTab({ expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts }: CostsForecastTabProps) {
  const now = new Date();
  const [customMonths, setCustomMonths] = useState(3);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [activePreset, setActivePreset] = useState<string>("thisMonth");
  const [customPopoverOpen, setCustomPopoverOpen] = useState(false);

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const nextMonthInterval = { start: startOfMonth(addMonths(now, 1)), end: endOfMonth(addMonths(now, 1)) };

  const unpaidSupplier = expectedSupplierPayments.filter(p => !p.isPaid);

  const sumInPeriod = <T extends { expectedDate: Date | null; amount: number }>(items: T[], interval: { start: Date; end: Date }) =>
    items.filter(i => i.expectedDate && isWithinInterval(i.expectedDate, interval)).reduce((s, i) => s + i.amount, 0);

  const totals = useMemo(() => ({
    thisMonth: sumInPeriod(expectedExpenses, { start: thisMonthStart, end: thisMonthEnd }) + sumInPeriod(expectedCommissions, { start: thisMonthStart, end: thisMonthEnd }) + sumInPeriod(unpaidSupplier, { start: thisMonthStart, end: thisMonthEnd }) + sumInPeriod(expectedCompanyCosts, { start: thisMonthStart, end: thisMonthEnd }),
    nextMonth: sumInPeriod(expectedExpenses, nextMonthInterval) + sumInPeriod(expectedCommissions, nextMonthInterval) + sumInPeriod(unpaidSupplier, nextMonthInterval) + sumInPeriod(expectedCompanyCosts, nextMonthInterval),
  }), [expectedExpenses, expectedCommissions, unpaidSupplier, expectedCompanyCosts]);

  const customPeriodTotal = useMemo(() => {
    const start = startOfMonth(addMonths(now, 1));
    const end = endOfMonth(addMonths(now, customMonths));
    const interval = { start, end };
    return sumInPeriod(expectedExpenses, interval) + sumInPeriod(expectedCommissions, interval) + sumInPeriod(unpaidSupplier, interval) + sumInPeriod(expectedCompanyCosts, interval);
  }, [customMonths, expectedExpenses, expectedCommissions, unpaidSupplier, expectedCompanyCosts]);

  // Preset logic
  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    switch (preset) {
      case "thisMonth":
        setDateFrom(thisMonthStart);
        setDateTo(thisMonthEnd);
        break;
      case "nextQuarter": {
        setDateFrom(startOfMonth(addMonths(now, 1)));
        setDateTo(endOfMonth(addMonths(now, 3)));
        break;
      }
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

  // Date filter — items without date are always shown (with visual indicator)
  const inDateRange = (d: Date | null) => {
    if (activePreset === "all" && !dateFrom && !dateTo) return true;
    if (!d) return true; // always show items without a date
    const effectiveFrom = dateFrom || thisMonthStart;
    const effectiveTo = dateTo || thisMonthEnd;
    if (d < startOfDay(effectiveFrom)) return false;
    if (d > endOfMonth(effectiveTo)) return false;
    return true;
  };

  const filteredExpenses = expectedExpenses.filter(e => inDateRange(e.expectedDate));
  const filteredCommissions = expectedCommissions.filter(c => inDateRange(c.expectedDate));
  const filteredSupplier = unpaidSupplier.filter(p => inDateRange(p.expectedDate));
  const filteredCosts = expectedCompanyCosts.filter(c => inDateRange(c.expectedDate));

  const periodTotal = useMemo(() =>
    filteredExpenses.reduce((s, e) => s + e.amount, 0) +
    filteredCommissions.reduce((s, c) => s + c.amount, 0) +
    filteredSupplier.reduce((s, p) => s + p.amount, 0) +
    filteredCosts.reduce((s, c) => s + c.amount, 0),
  [filteredExpenses, filteredCommissions, filteredSupplier, filteredCosts]);

  return (
    <div className="space-y-6">
      {/* Hero aggregate card */}
      <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
        <CardContent className="pt-6 pb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Totale Uscite Periodo</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(periodTotal)}</p>
          </div>
          <div className="text-xs text-muted-foreground text-right space-y-0.5">
            <p>Squadre: {formatCurrency(filteredExpenses.reduce((s, e) => s + e.amount, 0))}</p>
            <p>Provvigioni: {formatCurrency(filteredCommissions.reduce((s, c) => s + c.amount, 0))}</p>
            <p>Fornitori: {formatCurrency(filteredSupplier.reduce((s, p) => s + p.amount, 0))}</p>
            <p>Costi Az.: {formatCurrency(filteredCosts.reduce((s, c) => s + c.amount, 0))}</p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Uscite questo mese</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totals.thisMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Uscite prossimo mese</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totals.nextMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
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
            <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(customPeriodTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Date preset filters */}
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {/* Squadre Esterne */}
      {filteredExpenses.length > 0 && (
        <CostSection
          title="Squadre Esterne"
          total={filteredExpenses.reduce((s, e) => s + e.amount, 0)}
          headers={["Data prevista", "Ordine", "Squadra", "Importo"]}
          rows={filteredExpenses.map((e, i) => ({
            key: `${e.orderId}-${i}`,
            orderId: e.orderId,
            cells: [
              e.expectedDate ? format(e.expectedDate, "dd/MM/yyyy") : "—",
              e.orderCode || "—",
              e.teamName,
              formatCurrency(e.amount),
            ],
          }))}
        />
      )}

      {/* Provvigioni */}
      {filteredCommissions.length > 0 && (
        <CostSection
          title="Provvigioni Venditori"
          total={filteredCommissions.reduce((s, c) => s + c.amount, 0)}
          headers={["Data prevista", "Ordine", "Venditore", "Importo"]}
          rows={filteredCommissions.map((c, i) => ({
            key: `${c.orderId}-${i}`,
            orderId: c.orderId,
            cells: [
              c.expectedDate ? format(c.expectedDate, "dd/MM/yyyy") : "—",
              c.orderCode || "—",
              c.salespersonName,
              formatCurrency(c.amount),
            ],
          }))}
        />
      )}

      {/* Fornitori */}
      {filteredSupplier.length > 0 && (
        <CostSection
          title="Pagamenti Fornitori"
          total={filteredSupplier.reduce((s, p) => s + p.amount, 0)}
          headers={["Data prevista", "Ordine", "Fornitore", "Tipo", "Importo"]}
          rows={filteredSupplier.map((p, i) => ({
            key: `${p.orderItemId}-${i}`,
            orderId: p.orderId,
            cells: [
              p.expectedDate ? format(p.expectedDate, "dd/MM/yyyy") : "—",
              p.orderCode || "—",
              p.supplierName,
              p.type,
              formatCurrency(p.amount),
            ],
          }))}
        />
      )}

      {/* Costi Aziendali */}
      {filteredCosts.length > 0 && (
        <CostSection
          title="Costi Aziendali"
          total={filteredCosts.reduce((s, c) => s + c.amount, 0)}
          headers={["Scadenza", "Nome", "Tipo", "Importo"]}
          rows={filteredCosts.map((c) => ({
            key: c.id,
            cells: [
              c.expectedDate ? format(c.expectedDate, "dd/MM/yyyy") : "—",
              c.name,
              c.type,
              formatCurrency(c.amount),
            ],
          }))}
        />
      )}

      {filteredExpenses.length === 0 && filteredCommissions.length === 0 && filteredSupplier.length === 0 && filteredCosts.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          {activePreset !== "all" ? "Nessun costo nel periodo selezionato" : "Nessun costo previsto"}
        </p>
      )}
    </div>
  );
}

function CostSection({ title, total, headers, rows }: {
  title: string;
  total: number;
  headers: string[];
  rows: { key: string; orderId?: string | null; cells: string[] }[];
}) {
  const navigate = useNavigate();
  const accessors = useMemo(() => {
    const acc: Record<string, (item: { key: string; orderId?: string | null; cells: string[] }) => string | number> = {};
    headers.forEach((h, i) => {
      acc[h] = (row) => {
        const val = row.cells[i];
        const num = parseFloat(val.replace(/[^\d.,-]/g, "").replace(",", "."));
        return isNaN(num) ? val : num;
      };
    });
    return acc;
  }, [headers]);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(rows, accessors);
  const { paginatedItems, currentPage, totalPages, pageSize, totalItems, setPage, setPageSize } = usePagination(sortedItems);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className="text-sm font-semibold text-red-600">{formatCurrency(total)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map(h => (
                <SortableTableHead
                  key={h}
                  column={h}
                  label={h}
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                  className={h === "Importo" ? "text-right" : ""}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.map(row => (
              <TableRow
                key={row.key}
                className={row.orderId ? "cursor-pointer hover:bg-muted/50" : ""}
                onClick={() => row.orderId && navigate(`/azienda/ordini/${row.orderId}`)}
              >
                {row.cells.map((cell, i) => (
                  <TableCell key={i} className={`text-sm ${i === row.cells.length - 1 ? "text-right font-medium" : ""}`}>
                    {cell}
                  </TableCell>
                ))}
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
      </CardContent>
    </Card>
  );
}
