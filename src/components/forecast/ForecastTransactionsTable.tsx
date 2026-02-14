import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, isBefore, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, Building2, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangeFilter } from "@/components/orders/DateRangeFilter";
import { formatCurrency } from "@/lib/formatters";
import type { ExpectedPayment, ExpectedExpense, CompanyCostEntry, DateRange } from "@/lib/forecastTypes";

interface ForecastTransactionsTableProps {
  expectedPayments: ExpectedPayment[];
  expectedExpenses: ExpectedExpense[];
  expectedCompanyCosts: CompanyCostEntry[];
  activeTab: "all" | "income" | "expenses";
  onActiveTabChange: (value: "all" | "income" | "expenses") => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export function ForecastTransactionsTable({
  expectedPayments,
  expectedExpenses,
  expectedCompanyCosts,
  activeTab,
  onActiveTabChange,
  dateRange,
  onDateRangeChange,
}: ForecastTransactionsTableProps) {
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

  const renderTransactionRow = (transaction: any, index: number, keyPrefix = "") => (
    <TableRow key={`${keyPrefix}${transaction.orderId}-${transaction.direction}-${index}`}>
      {keyPrefix === "" && (
        <TableCell>
          {transaction.expectedDate
            ? format(transaction.expectedDate, "dd/MM/yyyy", { locale: it })
            : <span className="text-muted-foreground italic">Non definita</span>
          }
        </TableCell>
      )}
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
          ? transaction.customerName
          : transaction.teamName || transaction.name
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
      <TableCell
        className={`text-right font-medium ${
          transaction.direction === "in" ? "text-green-600" : "text-destructive"
        }`}
      >
        {transaction.direction === "in" ? "+" : "-"}
        {formatCurrency(transaction.amount)}
      </TableCell>
    </TableRow>
  );

  return (
    <>
      {/* Main Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Dettaglio Movimenti</CardTitle>
              <CardDescription>Entrate e uscite non ancora registrate</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="all">Tutti</TabsTrigger>
                  <TabsTrigger value="income">Entrate</TabsTrigger>
                  <TabsTrigger value="expenses">Uscite</TabsTrigger>
                </TabsList>
              </Tabs>
              <DateRangeFilter
                label="Filtra per data"
                range={dateRange}
                onRangeChange={onDateRangeChange}
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
                  {filteredTransactions.map((transaction, index) =>
                    renderTransactionRow(transaction, index)
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions Without Date */}
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
                  {transactionsWithoutDate.map((transaction, index) =>
                    renderTransactionRow(transaction, index, "no-date-")
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
