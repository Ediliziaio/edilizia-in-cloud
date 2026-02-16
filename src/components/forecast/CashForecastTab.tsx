import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import type { ForecastStats, ExpectedPayment, ExpectedExpense, ExpectedCommission, ExpectedSupplierPayment, CompanyCostEntry } from "@/lib/forecastTypes";

interface CashForecastTabProps {
  stats: ForecastStats;
  expectedPayments: ExpectedPayment[];
  expectedExpenses: ExpectedExpense[];
  expectedCommissions: ExpectedCommission[];
  expectedSupplierPayments: ExpectedSupplierPayment[];
  expectedCompanyCosts: CompanyCostEntry[];
}

type FilterCategory = "all" | "income" | "expenses";

interface UnifiedTransaction {
  date: Date | null;
  description: string;
  orderCode: string | null;
  category: string;
  amount: number;
  direction: "in" | "out";
}

export function CashForecastTab({ stats, expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts }: CashForecastTabProps) {
  const [filter, setFilter] = useState<FilterCategory>("all");

  const transactions = useMemo<UnifiedTransaction[]>(() => {
    const items: UnifiedTransaction[] = [];

    expectedPayments.forEach(p => items.push({ date: p.expectedDate, description: p.customerName, orderCode: p.orderCode, category: p.type, amount: p.amount, direction: "in" }));
    expectedExpenses.forEach(e => items.push({ date: e.expectedDate, description: e.teamName, orderCode: e.orderCode, category: "Squadra Esterna", amount: e.amount, direction: "out" }));
    expectedCommissions.forEach(c => items.push({ date: c.expectedDate, description: c.salespersonName, orderCode: c.orderCode, category: "Provvigione", amount: c.amount, direction: "out" }));
    expectedSupplierPayments.filter(p => !p.isPaid).forEach(s => items.push({ date: s.expectedDate, description: s.supplierName, orderCode: s.orderCode, category: s.type, amount: s.amount, direction: "out" }));
    expectedCompanyCosts.forEach(c => items.push({ date: c.expectedDate, description: c.name, orderCode: null, category: c.type, amount: c.amount, direction: "out" }));

    return items
      .filter(t => filter === "all" || (filter === "income" ? t.direction === "in" : t.direction === "out"))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.getTime() - b.date.getTime();
      });
  }, [expectedPayments, expectedExpenses, expectedCommissions, expectedSupplierPayments, expectedCompanyCosts, filter]);

  return (
    <div className="space-y-6">
      {/* Net Cash Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NetCard title="Questo mese" income={stats.thisMonth.income} expenses={stats.thisMonth.expenses} net={stats.thisMonth.net} />
        <NetCard title="Prossimo mese" income={stats.nextMonth.income} expenses={stats.nextMonth.expenses} net={stats.nextMonth.net} />
        <NetCard title="Prossimi 3 mesi" income={stats.next3Months.income} expenses={stats.next3Months.expenses} net={stats.next3Months.net} />
      </div>

      {/* Unified Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Tutti i movimenti previsti</CardTitle>
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterCategory)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="income">Solo entrate</SelectItem>
                <SelectItem value="expenses">Solo uscite</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nessun movimento previsto</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t, i) => (
                  <TableRow key={i}>
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
