import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/formatters";
import { calculateNetFromGross } from "@/lib/vatUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OrderItem {
  name: string;
  purchase_price?: number;
  quantity: number;
  vat_rate?: number;
}

interface OrderEconomicsProps {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  items: OrderItem[];
}

interface CostBreakdown {
  name: string;
  grossCost: number;
  vatRate: number;
  netCost: number;
  vatAmount: number;
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
    staleTime: 2 * 60 * 1000,
  });

  // Fetch order external teams costs with VAT rate
  const { data: orderExternalTeams = [] } = useQuery({
    queryKey: ["order-external-teams", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_external_teams")
        .select("total_cost, vat_rate, external_team:external_teams(name)")
        .eq("order_id", orderId);

      if (error) throw error;
      return data as { total_cost: number; vat_rate: number; external_team: { name: string } }[];
    },
    enabled: !!orderId,
    staleTime: 2 * 60 * 1000,
  });

  // Calculate sale totals
  const saleVatAmount = totalAmount * (vatRate / 100);
  const saleGross = totalAmount + saleVatAmount;

  // Calculate article costs with VAT breakdown
  const itemCostBreakdowns: CostBreakdown[] = items
    .filter((item) => item.purchase_price && item.purchase_price > 0)
    .map((item) => {
      const grossCost = (item.purchase_price || 0) * item.quantity;
      const itemVatRate = item.vat_rate ?? 22;
      const { netAmount, vatAmount } = calculateNetFromGross(grossCost, itemVatRate);
      return {
        name: item.name,
        grossCost,
        vatRate: itemVatRate,
        netCost: netAmount,
        vatAmount,
      };
    });

  const totalItemsGross = itemCostBreakdowns.reduce((sum, item) => sum + item.grossCost, 0);
  const totalItemsNet = itemCostBreakdowns.reduce((sum, item) => sum + item.netCost, 0);
  const totalItemsVat = itemCostBreakdowns.reduce((sum, item) => sum + item.vatAmount, 0);

  // Calculate employee costs (internal labor - no VAT deductible typically)
  const totalEmployeeCosts = orderEmployees.reduce((sum, e) => sum + e.total_cost, 0);

  // Calculate external team costs with VAT breakdown
  const teamCostBreakdowns: CostBreakdown[] = orderExternalTeams.map((team) => {
    const grossCost = team.total_cost;
    const teamVatRate = team.vat_rate ?? 22;
    const { netAmount, vatAmount } = calculateNetFromGross(grossCost, teamVatRate);
    return {
      name: team.external_team.name,
      grossCost,
      vatRate: teamVatRate,
      netCost: netAmount,
      vatAmount,
    };
  });

  const totalTeamsGross = teamCostBreakdowns.reduce((sum, t) => sum + t.grossCost, 0);
  const totalTeamsNet = teamCostBreakdowns.reduce((sum, t) => sum + t.netCost, 0);
  const totalTeamsVat = teamCostBreakdowns.reduce((sum, t) => sum + t.vatAmount, 0);

  // Total labor costs (employees are net cost, external teams with VAT breakdown)
  const totalLaborNet = totalEmployeeCosts + totalTeamsNet;
  const totalLaborVat = totalTeamsVat;

  // VAT summary
  const vatDebit = saleVatAmount; // IVA a debito (vendita)
  const vatCredit = totalItemsVat + totalTeamsVat; // IVA a credito (acquisti)
  const vatBalance = vatDebit - vatCredit; // IVA netta da versare

  // Calculate margin based on net costs
  const totalCostsNet = totalItemsNet + totalLaborNet;
  const grossMargin = totalAmount - totalCostsNet;
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
              <span>{formatCurrency(saleVatAmount)}</span>
            </div>
            <div className="flex justify-between text-primary font-semibold">
              <span>Totale con IVA</span>
              <span>{formatCurrency(saleGross)}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Article Costs Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">COSTI ARTICOLI</h4>
          {itemCostBreakdowns.length > 0 ? (
            <div className="space-y-2">
              {itemCostBreakdowns.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.name} <span className="text-xs">({item.vatRate}%)</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground line-through">
                      {formatCurrency(item.grossCost)}
                    </span>
                    <span>{formatCurrency(item.netCost)}</span>
                  </span>
                </div>
              ))}
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>Totale Netto Articoli</span>
                <span className="text-destructive">{formatCurrency(totalItemsNet)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>IVA detraibile articoli</span>
                <span className="text-green-600">{formatCurrency(totalItemsVat)}</span>
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
          {(totalEmployeeCosts > 0 || teamCostBreakdowns.length > 0) ? (
            <div className="space-y-2">
              {totalEmployeeCosts > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dipendenti Interni</span>
                  <span>{formatCurrency(totalEmployeeCosts)}</span>
                </div>
              )}
              {teamCostBreakdowns.map((team, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {team.name} <span className="text-xs">({team.vatRate}%)</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {team.vatRate > 0 && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatCurrency(team.grossCost)}
                      </span>
                    )}
                    <span>{formatCurrency(team.netCost)}</span>
                  </span>
                </div>
              ))}
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>Totale Netto Manodopera</span>
                <span className="text-destructive">{formatCurrency(totalLaborNet)}</span>
              </div>
              {totalLaborVat > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>IVA detraibile manodopera</span>
                  <span className="text-green-600">{formatCurrency(totalLaborVat)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun costo manodopera registrato
            </p>
          )}
        </div>

        <Separator />

        {/* VAT Summary Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            RIEPILOGO IVA
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>IVA a debito (vendita)</span>
              <span className="text-destructive">{formatCurrency(vatDebit)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>IVA a credito (acquisti)</span>
              <span className="text-green-600">{formatCurrency(vatCredit)}</span>
            </div>
            <div className="flex justify-between font-medium pt-2 border-t">
              <span>IVA netta da versare</span>
              <span className={vatBalance >= 0 ? "text-destructive" : "text-green-600"}>
                {formatCurrency(vatBalance)}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Margin Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">MARGINE</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Imponibile vendita</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Costi netti totali</span>
              <span>{formatCurrency(totalCostsNet)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
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
