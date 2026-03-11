import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, ShoppingBag, Wallet, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SalespersonDashboard() {
  const { user } = useAuth();

  // Fetch salesperson data
  const { data: salesperson } = useQuery({
    queryKey: queryKeys.salespersonPortal.record(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("*")
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch order commissions
  const { data: commissions = [] } = useQuery({
    queryKey: queryKeys.salespersonPortal.commissions(salesperson?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          *,
          order:orders(total_amount, description, created_at)
        `)
        .eq("salesperson_id", salesperson!.id);

      if (error) throw error;
      return data;
    },
    enabled: !!salesperson?.id,
    staleTime: 5 * 60 * 1000,
  });

  const totalOrders = commissions.length;
  const totalSold = commissions.reduce((sum, c) => sum + (c.order?.total_amount || 0), 0);
  const totalEarned = commissions.reduce((sum, c) => sum + c.commission_amount, 0);
  const paidEarnings = commissions.filter(c => c.is_paid).reduce((sum, c) => sum + c.commission_amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Benvenuto, {salesperson?.first_name || "Venditore"}</h1>
        <p className="text-muted-foreground">Ecco il riepilogo delle tue vendite</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ordini Totali</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Venduto Totale</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSold)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Provvigioni Maturate</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalEarned)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Provvigioni Pagate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(paidEarnings)}</div>
            <p className="text-xs text-muted-foreground">
              Da ricevere: {formatCurrency(totalEarned - paidEarnings)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
