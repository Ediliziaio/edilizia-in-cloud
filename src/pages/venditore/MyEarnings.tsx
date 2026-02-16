import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { it } from "date-fns/locale";
import { Wallet, TrendingUp, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
import { formatCurrency } from "@/lib/formatters";

export default function MyEarnings() {
  const { user } = useAuth();

  // Find salesperson record for this user
  const { data: salesperson, isLoading: loadingSalesperson } = useQuery({
    queryKey: ["my-salesperson-record", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name, commission_type, commission_value")
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all commissions for this salesperson
  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["salesperson-commissions", salesperson?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, commission_amount, commission_type, commission_value, 
          is_paid, paid_date, payment_expected_date, created_at,
          order:orders!inner(id, order_code, total_amount)
        `)
        .eq("salesperson_id", salesperson!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!salesperson?.id,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingSalesperson || loadingCommissions;

  // Calculate stats
  const stats = useMemo(() => {
    const totalEarned = commissions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
    const totalPaid = commissions
      .filter((c) => c.is_paid)
      .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
    const totalPending = totalEarned - totalPaid;
    const paidPercentage = totalEarned > 0 ? (totalPaid / totalEarned) * 100 : 0;

    return {
      totalEarned,
      totalPaid,
      totalPending,
      paidPercentage,
      paidCount: commissions.filter((c) => c.is_paid).length,
      pendingCount: commissions.filter((c) => !c.is_paid).length,
    };
  }, [commissions]);

  // Chart data - last 6 months
  const chartData = useMemo(() => {
    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const monthCommissions = commissions
        .filter((c) => {
          const createdAt = new Date(c.created_at);
          return isWithinInterval(createdAt, { start: monthStart, end: monthEnd });
        })
        .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

      months.push({
        month: format(monthDate, "MMM", { locale: it }),
        Provvigioni: monthCommissions,
      });
    }

    return months;
  }, [commissions]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!salesperson) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Account venditore non trovato</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">I Miei Guadagni</h1>
        <p className="text-muted-foreground">
          Riepilogo delle provvigioni maturate
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maturate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalEarned)}</div>
            <p className="text-xs text-muted-foreground">
              {commissions.length} ordini totali
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.paidCount} provvigioni
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Da Ricevere</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalPending)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCount} in attesa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">% Pagato</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.paidPercentage.toFixed(0)}%</div>
            <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${stats.paidPercentage}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Trend Provvigioni</CardTitle>
          <CardDescription>Ultimi 6 mesi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `€${value}`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar 
                  dataKey="Provvigioni" 
                  fill="hsl(var(--primary))" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Commissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio Provvigioni</CardTitle>
          <CardDescription>
            Storico completo delle provvigioni
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nessuna provvigione ancora maturata</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Venduto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Provvigione</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell>
                        {format(new Date(commission.created_at), "dd/MM/yyyy", { locale: it })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {commission.order?.order_code || "—"}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(commission.order?.total_amount || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {commission.commission_type === "fixed"
                            ? `Fisso €${commission.commission_value}`
                            : `${commission.commission_value}%`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatCurrency(commission.commission_amount)}
                      </TableCell>
                      <TableCell>
                        {commission.is_paid ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Pagata
                            {commission.paid_date && (
                              <span className="ml-1 opacity-75">
                                ({format(new Date(commission.paid_date), "dd/MM", { locale: it })})
                              </span>
                            )}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            Da pagare
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
