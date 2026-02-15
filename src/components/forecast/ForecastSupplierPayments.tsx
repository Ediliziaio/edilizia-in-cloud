import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Truck, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import type { ExpectedSupplierPayment } from "@/lib/forecastTypes";

interface ForecastSupplierPaymentsProps {
  expectedSupplierPayments: ExpectedSupplierPayment[];
  supplierPaymentsTotal: number;
}

export function ForecastSupplierPayments({
  expectedSupplierPayments,
  supplierPaymentsTotal,
}: ForecastSupplierPaymentsProps) {
  const now = new Date();

  const unpaidPayments = expectedSupplierPayments.filter((p) => !p.isPaid);
  
  // Group by supplier for summary
  const supplierSummary = useMemo(() => {
    const map = new Map<string, { total: number; paid: number; unpaid: number; count: number }>();
    expectedSupplierPayments.forEach((p) => {
      const existing = map.get(p.supplierName) || { total: 0, paid: 0, unpaid: 0, count: 0 };
      existing.total += p.amount;
      if (p.isPaid) existing.paid += p.amount;
      else existing.unpaid += p.amount;
      existing.count++;
      map.set(p.supplierName, existing);
    });
    return Array.from(map.entries()).sort(([, a], [, b]) => b.unpaid - a.unpaid);
  }, [expectedSupplierPayments]);

  const getDeadlineBadge = (date: Date | null) => {
    if (!date) return <Badge variant="outline" className="text-muted-foreground">Senza data</Badge>;
    const days = differenceInDays(date, now);
    if (days < 0)
      return <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400">Scaduto ({Math.abs(days)}g)</Badge>;
    if (days <= 7)
      return <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400">Tra {days}g</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">{format(date, "dd/MM/yyyy", { locale: it })}</Badge>;
  };

  if (unpaidPayments.length === 0 && supplierSummary.length === 0) return null;

  return (
    <Card className="border-indigo-200 bg-indigo-50/50 dark:bg-indigo-900/10 dark:border-indigo-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-indigo-600" />
          Pagamenti Fornitori
        </CardTitle>
        <CardDescription>
          Rate e pagamenti in scadenza verso i fornitori
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-4 rounded-lg bg-background border">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-indigo-600" />
              <span className="text-sm text-muted-foreground">Da pagare</span>
            </div>
            <p className="text-2xl font-bold text-indigo-600">
              {formatCurrency(supplierPaymentsTotal)}
            </p>
            <p className="text-xs text-muted-foreground">{unpaidPayments.length} rate in sospeso</p>
          </div>
          <div className="p-4 rounded-lg bg-background border">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Scadute</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(
                unpaidPayments
                  .filter((p) => p.expectedDate && p.expectedDate < now)
                  .reduce((s, p) => s + p.amount, 0)
              )}
            </p>
          </div>
        </div>

        {/* Supplier progress bars */}
        {supplierSummary.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Riepilogo per Fornitore</h4>
            {supplierSummary.map(([name, data]) => {
              const paidPct = data.total > 0 ? (data.paid / data.total) * 100 : 0;
              return (
                <div key={name} className="p-3 rounded-lg border bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{name}</span>
                    <div className="flex items-center gap-2 text-xs">
                      {data.paid > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          {formatCurrency(data.paid)}
                        </span>
                      )}
                      {data.unpaid > 0 && (
                        <span className="text-indigo-600 font-medium">
                          {formatCurrency(data.unpaid)} da pagare
                        </span>
                      )}
                    </div>
                  </div>
                  <Progress value={paidPct} className="h-2 [&>div]:bg-indigo-500" />
                  <div className="flex justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">{Math.round(paidPct)}% pagato</span>
                    <span className="text-[11px] text-muted-foreground">Totale: {formatCurrency(data.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Upcoming payments table */}
        {unpaidPayments.length > 0 && (
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornitore</TableHead>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Tipo Rata</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidPayments.slice(0, 8).map((payment, idx) => (
                  <TableRow key={`${payment.orderItemId}-${idx}`}>
                    <TableCell className="font-medium">{payment.supplierName}</TableCell>
                    <TableCell>
                      <Link
                        to={`/azienda/ordini/${payment.orderId}`}
                        className="text-primary hover:underline text-sm"
                      >
                        {payment.orderCode || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-indigo-400 text-indigo-600 gap-1">
                        <Truck className="h-3 w-3" />
                        {payment.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{getDeadlineBadge(payment.expectedDate)}</TableCell>
                    <TableCell className="text-right font-medium text-indigo-600">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
