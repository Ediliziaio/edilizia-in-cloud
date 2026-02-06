import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { 
  format, 
  addMonths, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval,
  isSameMonth,
  isAfter,
  isBefore
} from "date-fns";
import { it } from "date-fns/locale";
import { 
  CalendarClock, 
  TrendingUp, 
  Wallet, 
  PiggyBank,
  Calendar
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface ExpectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: "Acconto 1" | "Acconto 2" | "Saldo";
  amount: number;
  expectedDate: Date | null;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export default function CashFlowForecast() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });

  // Query ordini con pagamenti non incassati
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["forecast-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          deposit_amount,
          deposit_paid,
          deposit_expected_date,
          deposit_2_amount,
          deposit_2_paid,
          deposit_2_expected_date,
          balance_amount,
          balance_paid,
          balance_expected_date,
          customer:profiles!orders_customer_id_fkey(first_name, last_name)
        `);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Elabora pagamenti attesi
  const expectedPayments = useMemo(() => {
    const payments: ExpectedPayment[] = [];

    orders.forEach((order) => {
      const customerName = order.customer 
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Cliente sconosciuto";

      // Acconto 1
      if (!order.deposit_paid && order.deposit_amount && order.deposit_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Acconto 1",
          amount: Number(order.deposit_amount),
          expectedDate: order.deposit_expected_date 
            ? new Date(order.deposit_expected_date) 
            : null,
        });
      }

      // Acconto 2
      if (!order.deposit_2_paid && order.deposit_2_amount && order.deposit_2_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Acconto 2",
          amount: Number(order.deposit_2_amount),
          expectedDate: order.deposit_2_expected_date 
            ? new Date(order.deposit_2_expected_date) 
            : null,
        });
      }

      // Saldo
      if (!order.balance_paid && order.balance_amount && order.balance_amount > 0) {
        payments.push({
          orderId: order.id,
          orderCode: order.order_code,
          customerName,
          type: "Saldo",
          amount: Number(order.balance_amount),
          expectedDate: order.balance_expected_date 
            ? new Date(order.balance_expected_date) 
            : null,
        });
      }
    });

    // Ordina per data prevista
    return payments.sort((a, b) => {
      if (!a.expectedDate && !b.expectedDate) return 0;
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      return a.expectedDate.getTime() - b.expectedDate.getTime();
    });
  }, [orders]);

  // Calcola statistiche
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
    const nextMonth = { 
      start: startOfMonth(addMonths(now, 1)), 
      end: endOfMonth(addMonths(now, 1)) 
    };
    const next3Months = { 
      start: startOfMonth(now), 
      end: endOfMonth(addMonths(now, 2)) 
    };

    const thisMonthPayments = expectedPayments.filter(
      (p) => p.expectedDate && isWithinInterval(p.expectedDate, thisMonth)
    );
    const nextMonthPayments = expectedPayments.filter(
      (p) => p.expectedDate && isWithinInterval(p.expectedDate, nextMonth)
    );
    const next3MonthsPayments = expectedPayments.filter(
      (p) => p.expectedDate && isWithinInterval(p.expectedDate, next3Months)
    );

    return {
      thisMonth: {
        total: thisMonthPayments.reduce((sum, p) => sum + p.amount, 0),
        count: thisMonthPayments.length,
      },
      nextMonth: {
        total: nextMonthPayments.reduce((sum, p) => sum + p.amount, 0),
        count: nextMonthPayments.length,
      },
      next3Months: {
        total: next3MonthsPayments.reduce((sum, p) => sum + p.amount, 0),
        count: next3MonthsPayments.length,
      },
      total: {
        total: expectedPayments.reduce((sum, p) => sum + p.amount, 0),
        count: expectedPayments.length,
      },
    };
  }, [expectedPayments]);

  // Prepara dati per grafico (prossimi 6 mesi)
  const chartData = useMemo(() => {
    const months: { month: string; "Acconto 1": number; "Acconto 2": number; Saldo: number }[] = [];
    const now = new Date();

    for (let i = 0; i < 6; i++) {
      const monthDate = addMonths(now, i);
      const monthPayments = expectedPayments.filter(
        (p) => p.expectedDate && isSameMonth(p.expectedDate, monthDate)
      );

      months.push({
        month: format(monthDate, "MMM yyyy", { locale: it }),
        "Acconto 1": monthPayments
          .filter((p) => p.type === "Acconto 1")
          .reduce((sum, p) => sum + p.amount, 0),
        "Acconto 2": monthPayments
          .filter((p) => p.type === "Acconto 2")
          .reduce((sum, p) => sum + p.amount, 0),
        Saldo: monthPayments
          .filter((p) => p.type === "Saldo")
          .reduce((sum, p) => sum + p.amount, 0),
      });
    }

    return months;
  }, [expectedPayments]);

  // Filtra pagamenti per tabella
  const filteredPayments = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return expectedPayments;

    return expectedPayments.filter((payment) => {
      if (!payment.expectedDate) return false;
      
      const matchesFrom = !dateRange.from || !isBefore(payment.expectedDate, dateRange.from);
      const matchesTo = !dateRange.to || !isAfter(payment.expectedDate, dateRange.to);
      
      return matchesFrom && matchesTo;
    });
  }, [expectedPayments, dateRange]);

  // Pagamenti senza data
  const paymentsWithoutDate = expectedPayments.filter((p) => !p.expectedDate);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Previsionale Cassa</h1>
        <p className="text-muted-foreground">
          Analizza le entrate previste in base alle date di incasso
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Questo Mese</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.thisMonth.total)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.thisMonth.count} {stats.thisMonth.count === 1 ? "pagamento" : "pagamenti"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prossimo Mese</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.nextMonth.total)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.nextMonth.count} {stats.nextMonth.count === 1 ? "pagamento" : "pagamenti"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prossimi 3 Mesi</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.next3Months.total)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.next3Months.count} {stats.next3Months.count === 1 ? "pagamento" : "pagamenti"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale Non Incassato</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.total.total)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total.count} {stats.total.count === 1 ? "pagamento" : "pagamenti"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grafico Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline Incassi Previsti</CardTitle>
          <CardDescription>Previsione entrate per i prossimi 6 mesi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Bar dataKey="Acconto 1" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Acconto 2" stackId="a" fill="hsl(var(--primary) / 0.7)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Saldo" stackId="a" fill="hsl(var(--primary) / 0.4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabella Dettaglio */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Dettaglio Pagamenti Attesi</CardTitle>
              <CardDescription>Elenco di tutti i pagamenti non ancora incassati</CardDescription>
            </div>
            <DateRangeFilter
              label="Filtra per data"
              range={dateRange}
              onRangeChange={setDateRange}
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessun pagamento previsto nel periodo selezionato</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data Prevista</TableHead>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment, index) => (
                    <TableRow key={`${payment.orderId}-${payment.type}-${index}`}>
                      <TableCell>
                        {payment.expectedDate 
                          ? format(payment.expectedDate, "dd/MM/yyyy", { locale: it })
                          : <span className="text-muted-foreground italic">Non definita</span>
                        }
                      </TableCell>
                      <TableCell>
                        <Link 
                          to={`/azienda/ordini/${payment.orderId}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {payment.orderCode || "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{payment.customerName}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={
                            payment.type === "Saldo" 
                              ? "border-green-500 text-green-700" 
                              : payment.type === "Acconto 2"
                              ? "border-blue-500 text-blue-700"
                              : "border-orange-500 text-orange-700"
                          }
                        >
                          {payment.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
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

      {/* Sezione Pagamenti Senza Data */}
      {paymentsWithoutDate.length > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Pagamenti senza data prevista
            </CardTitle>
            <CardDescription>
              Questi pagamenti non hanno una data di incasso prevista
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsWithoutDate.map((payment, index) => (
                    <TableRow key={`no-date-${payment.orderId}-${payment.type}-${index}`}>
                      <TableCell>
                        <Link 
                          to={`/azienda/ordini/${payment.orderId}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {payment.orderCode || "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{payment.customerName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
