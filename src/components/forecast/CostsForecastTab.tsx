import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, addMonths, isWithinInterval } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
  const nextMonth = { start: startOfMonth(addMonths(now, 1)), end: endOfMonth(addMonths(now, 1)) };
  const next3 = { start: startOfMonth(now), end: endOfMonth(addMonths(now, 2)) };

  const unpaidSupplier = expectedSupplierPayments.filter(p => !p.isPaid);

  const sumInPeriod = <T extends { expectedDate: Date | null; amount: number }>(items: T[], interval: { start: Date; end: Date }) =>
    items.filter(i => i.expectedDate && isWithinInterval(i.expectedDate, interval)).reduce((s, i) => s + i.amount, 0);

  const totals = useMemo(() => ({
    thisMonth: sumInPeriod(expectedExpenses, thisMonth) + sumInPeriod(expectedCommissions, thisMonth) + sumInPeriod(unpaidSupplier, thisMonth) + sumInPeriod(expectedCompanyCosts, thisMonth),
    nextMonth: sumInPeriod(expectedExpenses, nextMonth) + sumInPeriod(expectedCommissions, nextMonth) + sumInPeriod(unpaidSupplier, nextMonth) + sumInPeriod(expectedCompanyCosts, nextMonth),
    next3: sumInPeriod(expectedExpenses, next3) + sumInPeriod(expectedCommissions, next3) + sumInPeriod(unpaidSupplier, next3) + sumInPeriod(expectedCompanyCosts, next3),
  }), [expectedExpenses, expectedCommissions, unpaidSupplier, expectedCompanyCosts]);

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
            <p className="text-sm text-muted-foreground">Uscite prossimi 3 mesi</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totals.next3)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Squadre Esterne */}
      {expectedExpenses.length > 0 && (
        <CostSection
          title="Squadre Esterne"
          total={expectedExpenses.reduce((s, e) => s + e.amount, 0)}
          headers={["Data prevista", "Ordine", "Squadra", "Importo"]}
          rows={expectedExpenses.map((e, i) => ({
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
      {expectedCommissions.length > 0 && (
        <CostSection
          title="Provvigioni Venditori"
          total={expectedCommissions.reduce((s, c) => s + c.amount, 0)}
          headers={["Data prevista", "Ordine", "Venditore", "Importo"]}
          rows={expectedCommissions.map((c, i) => ({
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
      {unpaidSupplier.length > 0 && (
        <CostSection
          title="Pagamenti Fornitori"
          total={unpaidSupplier.reduce((s, p) => s + p.amount, 0)}
          headers={["Data prevista", "Ordine", "Fornitore", "Tipo", "Importo"]}
          rows={unpaidSupplier.map((p, i) => ({
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
      {expectedCompanyCosts.length > 0 && (
        <CostSection
          title="Costi Aziendali"
          total={expectedCompanyCosts.reduce((s, c) => s + c.amount, 0)}
          headers={["Scadenza", "Nome", "Tipo", "Importo"]}
          rows={expectedCompanyCosts.map((c) => ({
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

      {expectedExpenses.length === 0 && expectedCommissions.length === 0 && unpaidSupplier.length === 0 && expectedCompanyCosts.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Nessun costo previsto</p>
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
