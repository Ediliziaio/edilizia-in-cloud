import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, Minus, DollarSign, Percent, Wallet, ClipboardCheck } from "lucide-react";

interface CeoKpi {
  label: string;
  value: string;
  delta: number | null; // % change vs previous month, null = no comparison
  icon: React.ElementType;
  prefix?: string;
}

interface DashboardCeoStripProps {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  marginThisMonth: number;
  marginPrevMonth: number;
  netCashFlow: number; // entrate - uscite mese corrente
  ordersThisMonth: number;
  ordersPrevMonth: number;
}

function calcDelta(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return current > 0 ? 100 : -100;
  return ((current - previous) / previous) * 100;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;

  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  const Icon = isPositive ? TrendingUp : isNeutral ? Minus : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : isNeutral
          ? "text-muted-foreground"
          : "text-destructive"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const DashboardCeoStrip = React.memo(function DashboardCeoStrip({
  revenueThisMonth,
  revenuePrevMonth,
  marginThisMonth,
  marginPrevMonth,
  netCashFlow,
  ordersThisMonth,
  ordersPrevMonth,
}: DashboardCeoStripProps) {
  const kpis: CeoKpi[] = [
    {
      label: "Fatturato Mese",
      value: formatCurrency(revenueThisMonth),
      delta: calcDelta(revenueThisMonth, revenuePrevMonth),
      icon: DollarSign,
    },
    {
      label: "Margine Lordo",
      value: `${marginThisMonth.toFixed(1)}%`,
      delta: calcDelta(marginThisMonth, marginPrevMonth),
      icon: Percent,
    },
    {
      label: "Saldo Cassa Netto",
      value: formatCurrency(netCashFlow),
      delta: null,
      icon: Wallet,
    },
    {
      label: "Ordini Mese",
      value: String(ordersThisMonth),
      delta: calcDelta(ordersThisMonth, ordersPrevMonth),
      icon: ClipboardCheck,
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className={`text-xl font-bold ${
                  kpi.label === "Saldo Cassa Netto"
                    ? netCashFlow >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                    : "text-foreground"
                }`}>
                  {kpi.value}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <kpi.icon className="h-4 w-4 text-primary" />
                <DeltaBadge delta={kpi.delta} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});

export { DashboardCeoStrip };
