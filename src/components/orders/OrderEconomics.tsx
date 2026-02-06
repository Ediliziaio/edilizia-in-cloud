import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface OrderItem {
  name: string;
  purchase_price?: number;
  quantity: number;
}

interface OrderEconomicsProps {
  totalAmount: number;
  vatRate: number;
  items: OrderItem[];
}

export function OrderEconomics({
  totalAmount,
  vatRate,
  items,
}: OrderEconomicsProps) {
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

  const totalCosts = itemCosts.reduce((sum, item) => sum + item.cost, 0);
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

        {/* Costs Section */}
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
                <span>Totale Costi</span>
                <span className="text-destructive">{formatCurrency(totalCosts)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun costo articolo registrato
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
