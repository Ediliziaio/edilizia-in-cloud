import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, addMonths, isWithinInterval, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
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

  const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
  const nextMonth = { start: startOfMonth(addMonths(now, 1)), end: endOfMonth(addMonths(now, 1)) };

  const unpaidSupplier = expectedSupplierPayments.filter(p => !p.isPaid);

  const sumInPeriod = <T extends { expectedDate: Date | null; amount: number }>(items: T[], interval: { start: Date; end: Date }) =>
    items.filter(i => i.expectedDate && isWithinInterval(i.expectedDate, interval)).reduce((s, i) => s + i.amount, 0);

  const totals = useMemo(() => ({
    thisMonth: sumInPeriod(expectedExpenses, thisMonth) + sumInPeriod(expectedCommissions, thisMonth) + sumInPeriod(unpaidSupplier, thisMonth) + sumInPeriod(expectedCompanyCosts, thisMonth),
    nextMonth: sumInPeriod(expectedExpenses, nextMonth) + sumInPeriod(expectedCommissions, nextMonth) + sumInPeriod(unpaidSupplier, nextMonth) + sumInPeriod(expectedCompanyCosts, nextMonth),
  }), [expectedExpenses, expectedCommissions, unpaidSupplier, expectedCompanyCosts]);

  // Custom period
  const customPeriodTotal = useMemo(() => {
    const start = startOfMonth(addMonths(now, 1));
    const end = endOfMonth(addMonths(now, customMonths));
    const interval = { start, end };
    return sumInPeriod(expectedExpenses, interval) + sumInPeriod(expectedCommissions, interval) + sumInPeriod(unpaidSupplier, interval) + sumInPeriod(expectedCompanyCosts, interval);
  }, [customMonths, expectedExpenses, expectedCommissions, unpaidSupplier, expectedCompanyCosts]);

  // Date filter helper
  const inDateRange = (d: Date | null) => {
    if (!dateFrom && !dateTo) return true;
    if (!d) return !dateFrom && !dateTo;
    if (dateFrom && d < startOfDay(dateFrom)) return false;
    if (dateTo && d > endOfMonth(dateTo)) return false;
    return true;
  };

  const filteredExpenses = expectedExpenses.filter(e => inDateRange(e.expectedDate));
  const filteredCommissions = expectedCommissions.filter(c => inDateRange(c.expectedDate));
  const filteredSupplier = unpaidSupplier.filter(p => inDateRange(p.expectedDate));
  const filteredCosts = expectedCompanyCosts.filter(c => inDateRange(c.expectedDate));

  const clearDates = () => { setDateFrom(undefined); setDateTo(undefined); };
  const hasDates = dateFrom || dateTo;

  return (
    <div className="space-y-6">
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

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Filtra per periodo:</span>
        <DatePickerButton label="Da" date={dateFrom} onSelect={setDateFrom} />
        <DatePickerButton label="A" date={dateTo} onSelect={setDateTo} />
        {hasDates && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearDates}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Squadre Esterne */}
      {filteredExpenses.length > 0 && (
        <CostSection
          title="Squadre Esterne"
          total={filteredExpenses.reduce((s, e) => s + e.amount, 0)}
          headers={["Data prevista", "Ordine", "Squadra", "Importo"]}
          rows={filteredExpenses.map((e, i) => ({
            key: `${e.orderId}-${i}`,
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
          {hasDates ? "Nessun costo nel periodo selezionato" : "Nessun costo previsto"}
        </p>
      )}
    </div>
  );
}

function CostSection({ title, total, headers, rows }: {
  title: string;
  total: number;
  headers: string[];
  rows: { key: string; cells: string[] }[];
}) {
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
              {headers.map(h => <TableHead key={h} className={h === "Importo" ? "text-right" : ""}>{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.key}>
                {row.cells.map((cell, i) => (
                  <TableCell key={i} className={`text-sm ${i === row.cells.length - 1 ? "text-right font-medium" : ""}`}>
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DatePickerButton({ label, date, onSelect }: { label: string; date: Date | undefined; onSelect: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-2", date && "border-primary")}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {date ? format(date, "dd/MM/yy", { locale: it }) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          locale={it}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
