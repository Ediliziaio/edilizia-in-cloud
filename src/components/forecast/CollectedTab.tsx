import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, addMonths, isWithinInterval, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePickerButton } from "@/components/forecast/DatePickerButton";
import { formatCurrency } from "@/lib/formatters";
import type { ExpectedPayment } from "@/lib/forecastTypes";

interface CollectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: string;
  amount: number;
  paidDate: Date;
}

interface CollectedTabProps {
  orders: any[];
  expectedPayments: ExpectedPayment[];
}

export function CollectedTab({ orders, expectedPayments }: CollectedTabProps) {
  const now = new Date();
  const [customMonths, setCustomMonths] = useState(3);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  // All collected payments (not limited to this month)
  const allCollected = useMemo<CollectedPayment[]>(() => {
    const collected: CollectedPayment[] = [];

    orders.forEach((inst: any) => {
      if (!inst.is_paid || !inst.paid_date || !inst.amount || Number(inst.amount) <= 0) return;
      const order = inst.order;
      const customerName = order?.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Cliente sconosciuto";

      collected.push({
        orderId: order?.id || inst.order_id,
        orderCode: order?.order_code || null,
        customerName,
        type: inst.label || inst.type || "Rata",
        amount: Number(inst.amount),
        paidDate: new Date(inst.paid_date),
      });
    });

    return collected.sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime());
  }, [orders]);

  // Collected this month (for card)
  const collectedThisMonth = useMemo(() => {
    const interval = { start: thisMonthStart, end: thisMonthEnd };
    return allCollected.filter(p => isWithinInterval(p.paidDate, interval));
  }, [allCollected, thisMonthStart, thisMonthEnd]);

  // Filtered collected for table
  const filteredCollected = useMemo(() => {
    if (!dateFrom && !dateTo) return collectedThisMonth;
    return allCollected.filter(p => {
      if (dateFrom && p.paidDate < startOfDay(dateFrom)) return false;
      if (dateTo && p.paidDate > endOfMonth(dateTo)) return false;
      return true;
    });
  }, [allCollected, collectedThisMonth, dateFrom, dateTo]);

  const collectedTotal = collectedThisMonth.reduce((s, p) => s + p.amount, 0);
  const filteredCollectedTotal = filteredCollected.reduce((s, p) => s + p.amount, 0);

  // Custom period stats for expected payments
  const customPeriodStats = useMemo(() => {
    const start = startOfMonth(addMonths(now, 1));
    const end = endOfMonth(addMonths(now, customMonths));
    const inRange = (d: Date | null) => d && isWithinInterval(d, { start, end });
    const payments = expectedPayments.filter(p => inRange(p.expectedDate));
    return {
      total: payments.reduce((s, p) => s + p.amount, 0),
      count: payments.length,
    };
  }, [customMonths, expectedPayments, now]);

  // Period payments for cards
  const periodPayments = useMemo(() => {
    const nextMonthStart = startOfMonth(addMonths(now, 1));
    const nextMonthEnd = endOfMonth(addMonths(now, 1));

    const thisMonth = expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: thisMonthStart, end: thisMonthEnd }));
    const nextMonth = expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: nextMonthStart, end: nextMonthEnd }));
    const noDate = expectedPayments.filter(p => !p.expectedDate);

    return {
      thisMonth,
      nextMonth,
      noDate,
      thisMonthTotal: thisMonth.reduce((s, p) => s + p.amount, 0),
      nextMonthTotal: nextMonth.reduce((s, p) => s + p.amount, 0),
      noDateTotal: noDate.reduce((s, p) => s + p.amount, 0),
    };
  }, [expectedPayments, thisMonthStart, thisMonthEnd, now]);

  const clearDates = () => { setDateFrom(undefined); setDateTo(undefined); };
  const hasDates = dateFrom || dateTo;
  const showingFiltered = hasDates;

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
            <p className="text-2xl font-bold mt-1">{formatCurrency(customPeriodStats.total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{customPeriodStats.count} pagamenti</p>
          </CardContent>
        </Card>
      </div>

      {/* Già Incassato */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg">
              {showingFiltered ? "Già incassato — Periodo personalizzato" : `Già incassato — ${format(now, "MMMM yyyy", { locale: it })}`}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <DatePickerButton label="Da" date={dateFrom} onSelect={setDateFrom} />
              <DatePickerButton label="A" date={dateTo} onSelect={setDateTo} />
              {hasDates && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearDates}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCollected.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun incasso registrato{showingFiltered ? " nel periodo selezionato" : " questo mese"}</p>
          ) : (
            <>
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
                  {filteredCollected.map((p, i) => (
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
              {showingFiltered && (
                <div className="flex justify-end mt-3 pt-3 border-t">
                  <span className="text-sm font-semibold text-emerald-600">Totale: {formatCurrency(filteredCollectedTotal)}</span>
                </div>
              )}
            </>
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

