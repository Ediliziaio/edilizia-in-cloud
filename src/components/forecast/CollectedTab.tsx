import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, addMonths, isWithinInterval } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import type { ExpectedPayment } from "@/lib/forecastTypes";

interface CollectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: "Acconto 1" | "Acconto 2" | "Saldo" | "Finanziamento";
  amount: number;
  paidDate: Date;
}

interface CollectedTabProps {
  orders: any[];
  expectedPayments: ExpectedPayment[];
}

export function CollectedTab({ orders, expectedPayments }: CollectedTabProps) {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  // Pagamenti già incassati questo mese
  const collectedThisMonth = useMemo<CollectedPayment[]>(() => {
    const collected: CollectedPayment[] = [];
    const interval = { start: thisMonthStart, end: thisMonthEnd };

    orders.forEach((order: any) => {
      const customerName = order.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Cliente sconosciuto";

      if (order.deposit_paid && order.deposit_paid_date) {
        const d = new Date(order.deposit_paid_date);
        if (isWithinInterval(d, interval) && order.deposit_amount > 0) {
          collected.push({ orderId: order.id, orderCode: order.order_code, customerName, type: "Acconto 1", amount: Number(order.deposit_amount), paidDate: d });
        }
      }
      if (order.deposit_2_paid && order.deposit_2_paid_date) {
        const d = new Date(order.deposit_2_paid_date);
        if (isWithinInterval(d, interval) && order.deposit_2_amount > 0) {
          collected.push({ orderId: order.id, orderCode: order.order_code, customerName, type: "Acconto 2", amount: Number(order.deposit_2_amount), paidDate: d });
        }
      }
      if (order.balance_paid && order.balance_paid_date) {
        const d = new Date(order.balance_paid_date);
        if (isWithinInterval(d, interval) && order.balance_amount > 0) {
          collected.push({ orderId: order.id, orderCode: order.order_code, customerName, type: "Saldo", amount: Number(order.balance_amount), paidDate: d });
        }
      }
      if (order.financing_paid && order.financing_paid_date) {
        const d = new Date(order.financing_paid_date);
        if (isWithinInterval(d, interval) && order.financing_amount > 0) {
          collected.push({ orderId: order.id, orderCode: order.order_code, customerName, type: "Finanziamento", amount: Number(order.financing_amount), paidDate: d });
        }
      }
    });

    return collected.sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime());
  }, [orders, thisMonthStart, thisMonthEnd]);

  const collectedTotal = collectedThisMonth.reduce((s, p) => s + p.amount, 0);

  // Da ricevere per periodo
  const periodPayments = useMemo(() => {
    const nextMonthStart = startOfMonth(addMonths(now, 1));
    const nextMonthEnd = endOfMonth(addMonths(now, 1));
    const next3End = endOfMonth(addMonths(now, 2));

    const thisMonth = expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: thisMonthStart, end: thisMonthEnd }));
    const nextMonth = expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: nextMonthStart, end: nextMonthEnd }));
    const next3Months = expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: thisMonthStart, end: next3End }));
    const noDate = expectedPayments.filter(p => !p.expectedDate);

    return {
      thisMonth,
      nextMonth,
      next3Months,
      noDate,
      thisMonthTotal: thisMonth.reduce((s, p) => s + p.amount, 0),
      nextMonthTotal: nextMonth.reduce((s, p) => s + p.amount, 0),
      next3MonthsTotal: next3Months.reduce((s, p) => s + p.amount, 0),
      noDateTotal: noDate.reduce((s, p) => s + p.amount, 0),
    };
  }, [expectedPayments, thisMonthStart, thisMonthEnd, now]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Incassato questo mese</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(collectedTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{collectedThisMonth.length} pagamenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Da ricevere questo mese</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(periodPayments.thisMonthTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodPayments.thisMonth.length} pagamenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Prossimo mese</p>
            <p className="text-2xl font-bold">{formatCurrency(periodPayments.nextMonthTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodPayments.nextMonth.length} pagamenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Prossimi 3 mesi</p>
            <p className="text-2xl font-bold">{formatCurrency(periodPayments.next3MonthsTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodPayments.next3Months.length} pagamenti</p>
          </CardContent>
        </Card>
      </div>

      {/* Già Incassato */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Già incassato — {format(now, "MMMM yyyy", { locale: it })}</CardTitle>
        </CardHeader>
        <CardContent>
          {collectedThisMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun incasso registrato questo mese</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectedThisMonth.map((p, i) => (
                  <TableRow key={`${p.orderId}-${p.type}-${i}`}>
                    <TableCell className="text-sm">{format(p.paidDate, "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-sm font-medium">{p.orderCode || "—"}</TableCell>
                    <TableCell className="text-sm">{p.customerName}</TableCell>
                    <TableCell className="text-sm">{p.type}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-emerald-600">{formatCurrency(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Da Ricevere */}
      <PaymentPeriodSection title={`Da ricevere — ${format(now, "MMMM yyyy", { locale: it })}`} payments={periodPayments.thisMonth} />
      <PaymentPeriodSection title={`Da ricevere — ${format(addMonths(now, 1), "MMMM yyyy", { locale: it })}`} payments={periodPayments.nextMonth} />
      {periodPayments.noDate.length > 0 && (
        <PaymentPeriodSection title="Da ricevere — Senza data prevista" payments={periodPayments.noDate} />
      )}
    </div>
  );
}

function PaymentPeriodSection({ title, payments }: { title: string; payments: ExpectedPayment[] }) {
  if (payments.length === 0) return null;
  const total = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className="text-sm font-semibold text-amber-600">{formatCurrency(total)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data prevista</TableHead>
              <TableHead>Ordine</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Importo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p, i) => (
              <TableRow key={`${p.orderId}-${p.type}-${i}`}>
                <TableCell className="text-sm">{p.expectedDate ? format(p.expectedDate, "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell className="text-sm font-medium">{p.orderCode || "—"}</TableCell>
                <TableCell className="text-sm">{p.customerName}</TableCell>
                <TableCell className="text-sm">{p.type}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatCurrency(p.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
