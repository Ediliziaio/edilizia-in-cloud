import { useMemo } from "react";
import { Package, ShoppingCart, Truck, CheckCircle2, AlertOctagon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { isItemOverdue } from "@/types/warehouse";
import type { WarehouseItem } from "@/types/warehouse";

interface WarehouseStatsProps {
  items: WarehouseItem[];
}

function ProgressRing({ percentage, size = 80, strokeWidth = 8 }: { 
  percentage: number; 
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{Math.round(percentage)}%</span>
      </div>
    </div>
  );
}

export default function WarehouseStats({ items }: WarehouseStatsProps) {
  const stats = useMemo(() => {
    const installed = items.filter((i) => i.status === "installato");
    const inMagazzino = items.filter((i) => i.status === "in_magazzino");
    const ordinati = items.filter((i) => i.status === "ordinato");
    const daOrdinare = items.filter((i) => i.status === "da_ordinare");
    const overdue = items.filter(isItemOverdue);

    const uniqueOrders = (arr: WarehouseItem[]) =>
      new Set(arr.map((i) => i.order.id)).size;

    const calculateValue = (arr: WarehouseItem[]) =>
      arr.reduce((sum, item) => {
        const price = item.purchase_price || 0;
        const qty = item.quantity || 1;
        return sum + price * qty;
      }, 0);

    const totalItems = items.length;
    const completedCount = installed.length;
    const completionPercentage = totalItems > 0 
      ? (completedCount / totalItems) * 100 
      : 0;

    return {
      completion: {
        percentage: completionPercentage,
        completed: completedCount,
        total: totalItems,
      },
      overdue: {
        count: overdue.length,
        orders: uniqueOrders(overdue),
      },
      inMagazzino: {
        count: inMagazzino.length,
        orders: uniqueOrders(inMagazzino),
        value: calculateValue(inMagazzino),
      },
      ordinati: {
        count: ordinati.length,
        orders: uniqueOrders(ordinati),
        value: calculateValue(ordinati),
      },
      daOrdinare: {
        count: daOrdinare.length,
        orders: uniqueOrders(daOrdinare),
        value: calculateValue(daOrdinare),
      },
    };
  }, [items]);

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {/* Completion Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Completamento</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <ProgressRing percentage={stats.completion.percentage} />
          <p className="text-xs text-muted-foreground mt-2">
            {stats.completion.completed}/{stats.completion.total} installati
          </p>
        </CardContent>
      </Card>

      {/* In Ritardo */}
      <Card className={cn(stats.overdue.count > 0 && "border-destructive")}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">In Ritardo</CardTitle>
          <AlertOctagon className={cn("h-4 w-4", stats.overdue.count > 0 ? "text-destructive" : "text-muted-foreground")} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", stats.overdue.count > 0 ? "text-destructive" : "text-muted-foreground")}>
            {stats.overdue.count}
          </div>
          <p className="text-xs text-muted-foreground">
            in {stats.overdue.orders} ordini
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            posa scaduta, non pronti
          </p>
        </CardContent>
      </Card>

      {/* In Magazzino */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">In Magazzino</CardTitle>
          <Package className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {stats.inMagazzino.count}
          </div>
          <p className="text-xs text-muted-foreground">
            in {stats.inMagazzino.orders} ordini
          </p>
          <p className={cn(
            "text-sm font-medium mt-1",
            stats.inMagazzino.value > 0 ? "text-green-600" : "text-muted-foreground"
          )}>
            {formatCurrency(stats.inMagazzino.value)} valore
          </p>
        </CardContent>
      </Card>

      {/* Ordinati */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">In Transito</CardTitle>
          <Truck className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {stats.ordinati.count}
          </div>
          <p className="text-xs text-muted-foreground">
            in {stats.ordinati.orders} ordini
          </p>
          <p className={cn(
            "text-sm font-medium mt-1",
            stats.ordinati.value > 0 ? "text-blue-600" : "text-muted-foreground"
          )}>
            {formatCurrency(stats.ordinati.value)} in arrivo
          </p>
        </CardContent>
      </Card>

      {/* Da Ordinare */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Da Ordinare</CardTitle>
          <ShoppingCart className="h-4 w-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">
            {stats.daOrdinare.count}
          </div>
          <p className="text-xs text-muted-foreground">
            in {stats.daOrdinare.orders} ordini
          </p>
          <p className={cn(
            "text-sm font-medium mt-1",
            stats.daOrdinare.value > 0 ? "text-amber-600" : "text-muted-foreground"
          )}>
            {formatCurrency(stats.daOrdinare.value)} da spendere
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
