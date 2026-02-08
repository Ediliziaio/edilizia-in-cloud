import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ShoppingBag, CheckCircle2, Clock, AlertCircle } from "lucide-react";
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

export default function MyOrders() {
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
  });

  // Fetch orders for this salesperson
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["salesperson-orders", salesperson?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          id, commission_amount, commission_type, commission_value, is_paid, paid_date, created_at,
          order:orders!inner(
            id, order_code, description, total_amount, created_at,
            deposit_paid, deposit_2_paid, balance_paid, vat_rate,
            customer:profiles!orders_customer_id_fkey(first_name, last_name)
          )
        `)
        .eq("salesperson_id", salesperson!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!salesperson?.id,
  });

  const isLoading = loadingSalesperson || loadingOrders;

  // Calculate payment status
  const getPaymentStatus = (order: any) => {
    const depositPaid = order.deposit_paid;
    const deposit2Paid = order.deposit_2_paid;
    const balancePaid = order.balance_paid;

    if (balancePaid && depositPaid) {
      return { label: "Saldato", variant: "default" as const, icon: CheckCircle2 };
    }
    if (depositPaid || deposit2Paid) {
      return { label: "Parziale", variant: "secondary" as const, icon: Clock };
    }
    return { label: "In attesa", variant: "outline" as const, icon: AlertCircle };
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded" />
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
        <h1 className="text-3xl font-bold tracking-tight">I Miei Ordini</h1>
        <p className="text-muted-foreground">
          Ordini associati al tuo profilo venditore
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale Ordini</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Venduto Totale</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(orders.reduce((sum, o) => sum + Number(o.order?.total_amount || 0), 0))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Provvigioni Totali</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(orders.reduce((sum, o) => sum + Number(o.commission_amount || 0), 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista Ordini</CardTitle>
          <CardDescription>
            Tutti gli ordini a te assegnati
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nessun ordine ancora assegnato</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ordine</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Venduto</TableHead>
                    <TableHead>Incasso</TableHead>
                    <TableHead className="text-right">Provvigione</TableHead>
                    <TableHead>Stato Provv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((item) => {
                    const paymentStatus = getPaymentStatus(item.order);
                    const PaymentIcon = paymentStatus.icon;
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          {format(new Date(item.created_at), "dd/MM/yyyy", { locale: it })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {item.order?.order_code || "—"}
                        </TableCell>
                        <TableCell>
                          {item.order?.customer
                            ? `${item.order.customer.first_name} ${item.order.customer.last_name}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.order?.total_amount || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={paymentStatus.variant} className="gap-1">
                            <PaymentIcon className="h-3 w-3" />
                            {paymentStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          {formatCurrency(item.commission_amount)}
                        </TableCell>
                        <TableCell>
                          {item.is_paid ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Pagata
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              Da pagare
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
