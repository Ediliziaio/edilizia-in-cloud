import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OrderItem {
  name: string;
  purchase_price?: number;
  quantity: number;
}

interface OrderEconomicsProps {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  items: OrderItem[];
}

export function OrderEconomics({
  orderId,
  totalAmount,
  vatRate,
  items,
}: OrderEconomicsProps) {
  // Fetch order employees costs
  const { data: orderEmployees = [] } = useQuery({
    queryKey: ["order-employees", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_employees")
        .select("total_cost, employee:employees(first_name, last_name)")
        .eq("order_id", orderId);

      if (error) throw error;
      return data as { total_cost: number; employee: { first_name: string; last_name: string } }[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000, // 2 minuti
  });

  // Fetch order external teams costs
  const { data: orderExternalTeams = [] } = useQuery({
    queryKey: ["order-external-teams", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("total_cost, external_team:external_teams(name)")
        .eq("order_id", orderId);

      if (error) throw error;
      return data as { total_cost: number; external_team: { name: string } }[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000, // 2 minuti
  });

  // Calculate totals
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;

  // Calculate total costs from items
  const itemCosts = items
    .filter((item) => item.purchase_price && item.purchase_price > 0)
    .map((item) => ({
      name: item.name,
      cost: (item.purchase_price || 0) * item.quantity,
    }));

  const totalArticleCosts = itemCosts.reduce((sum, item) => sum + item.cost, 0);

  // Calculate labor costs
  const totalEmployeeCosts = orderEmployees.reduce((sum, e) => sum + e.total_cost, 0);
  const totalExternalTeamCosts = orderExternalTeams.reduce((sum, t) => sum + t.total_cost, 0);
  const totalLaborCosts = totalEmployeeCosts + totalExternalTeamCosts;

  // Calculate margin with labor costs included
  const totalCosts = totalArticleCosts + totalLaborCosts;
  const grossMargin = totalAmount - totalCosts;
  const marginPercentage = totalAmount > 0 ? (grossMargin / totalAmount) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Conto Economico
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sales Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">VENDITA</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Imponibile</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>IVA ({vatRate}%)</span>
              <span>{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between text-primary font-semibold">
              <span>Totale con IVA</span>
              <span>{formatCurrency(totalWithVat)}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Article Costs Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">COSTI ARTICOLI</h4>
          {itemCosts.length > 0 ? (
            <div className="space-y-2">
              {itemCosts.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span>{formatCurrency(item.cost)}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>Totale Articoli</span>
                <span className="text-destructive">{formatCurrency(totalArticleCosts)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun costo articolo registrato
            </p>
          )}
        </div>

        <Separator />

        {/* Labor Costs Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">COSTI MANODOPERA</h4>
          {totalLaborCosts > 0 ? (
            <div className="space-y-2">
              {totalEmployeeCosts > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dipendenti Interni</span>
                  <span>{formatCurrency(totalEmployeeCosts)}</span>
                </div>
              )}
              {totalExternalTeamCosts > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Squadre Esterne</span>
                  <span>{formatCurrency(totalExternalTeamCosts)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>Totale Manodopera</span>
                <span className="text-destructive">{formatCurrency(totalLaborCosts)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun costo manodopera registrato
            </p>
          )}
        </div>

        <Separator />

        {/* Margin Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">MARGINE</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2">
                {grossMargin >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                Margine Lordo
              </span>
              <span
                className={`font-bold text-lg ${
                  grossMargin >= 0 ? "text-green-600" : "text-destructive"
                }`}
              >
                {formatCurrency(grossMargin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Margine %</span>
              <span
                className={`font-medium ${
                  marginPercentage >= 0 ? "text-green-600" : "text-destructive"
                }`}
              >
                {marginPercentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
