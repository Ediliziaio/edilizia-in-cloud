import { ShoppingBag, Euro, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";

interface OrdersStats {
  totalOrders: number;
  totalAmount: number;
  collected: number;
  pending: number;
}

interface OrdersStatsCardsProps {
  stats: OrdersStats;
}

export function OrdersStatsCards({ stats }: OrdersStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ShoppingBag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats.totalOrders}</p>
            <p className="text-xs text-muted-foreground">N° Ordini</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950">
            <Euro className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
            <p className="text-xs text-muted-foreground">Importo Totale</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950">
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatCurrency(stats.collected)}</p>
            <p className="text-xs text-muted-foreground">Incassato</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-950">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatCurrency(stats.pending)}</p>
            <p className="text-xs text-muted-foreground">Da Incassare</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
