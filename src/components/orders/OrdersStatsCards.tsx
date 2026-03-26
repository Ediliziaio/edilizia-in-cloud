import { ShoppingBag, Euro, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";

interface OrdersStats {
  totalOrders: number;
  totalGross: number;
  collected: number;
  pending: number;
}

interface OrdersStatsCardsProps {
  stats: OrdersStats;
}

export function OrdersStatsCards({ stats }: OrdersStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
            <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-base sm:text-2xl font-bold truncate">{stats.totalOrders}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">N° Ordini</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-950 shrink-0">
            <Euro className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-2xl font-bold truncate">{formatCurrency(stats.totalGross)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Totale Ivato</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 shrink-0">
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-2xl font-bold truncate">{formatCurrency(stats.collected)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Incassato</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 rounded-lg bg-orange-100 dark:bg-orange-950 shrink-0">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-2xl font-bold truncate">{formatCurrency(stats.pending)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Da Incassare</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
