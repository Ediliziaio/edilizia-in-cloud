import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, Minus, Euro, Percent, Wallet, ClipboardCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CeoKpi {
  label: string;
  value: string;
  delta: number | null;
  icon: React.ElementType;
  tooltip?: string;
  accent?: "positive" | "negative" | "neutral";
}

interface DashboardCeoStripProps {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  /** Margine ASSOLUTO in € questo mese (ricavi - costi diretti) */
  marginThisMonth: number;
  /** Margine ASSOLUTO in € mese precedente */
  marginPrevMonth: number;
  netCashFlow: number;
  ordersThisMonth: number;
  ordersPrevMonth: number;
}

function calcDelta(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return null;
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
  // FIX: il backend restituisce il margine ASSOLUTO in €, non una percentuale.
  // Calcoliamo la % qui: margine / fatturato * 100
  const marginPctThisMonth = revenueThisMonth > 0 ? (marginThisMonth / revenueThisMonth) * 100 : 0;
  const marginPctPrevMonth = revenuePrevMonth > 0 ? (marginPrevMonth / revenuePrevMonth) * 100 : 0;

  const marginAccent: "positive" | "negative" | "neutral" =
    marginPctThisMonth >= 30 ? "positive" :
    marginPctThisMonth >= 15 ? "neutral" :
    marginPctThisMonth > 0 ? "neutral" : "negative";

  const kpis: CeoKpi[] = [
    {
      label: "Fatturato Mese",
      value: formatCurrency(revenueThisMonth),
      delta: calcDelta(revenueThisMonth, revenuePrevMonth),
      icon: Euro,
      tooltip: "Somma totale ordini creati questo mese",
    },
    {
      label: "Margine Lordo",
      value: `${marginPctThisMonth.toFixed(1)}%`,
      delta: calcDelta(marginPctThisMonth, marginPctPrevMonth),
      icon: Percent,
      tooltip: `Margine in €: ${formatCurrency(marginThisMonth)}\n(Fatturato − costi diretti) ÷ Fatturato`,
      accent: marginAccent,
    },
    {
      label: "Saldo Cassa Netto",
      value: formatCurrency(netCashFlow),
      delta: null,
      icon: Wallet,
      tooltip: "Entrate − uscite previste nel mese in corso",
      accent: netCashFlow >= 0 ? "positive" : "negative",
    },
    {
      label: "Ordini Mese",
      value: String(ordersThisMonth),
      delta: calcDelta(ordersThisMonth, ordersPrevMonth),
      icon: ClipboardCheck,
      tooltip: "Numero di ordini creati questo mese",
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-2 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const accentClass =
            kpi.accent === "positive"
              ? "text-emerald-600 dark:text-emerald-400"
              : kpi.accent === "negative"
              ? "text-destructive"
              : "text-foreground";
          return (
            <Tooltip key={kpi.label}>
              <TooltipTrigger asChild>
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 hover:shadow-md transition-shadow cursor-help">
                  <CardContent className="pt-3 pb-2 px-3 sm:pt-4 sm:pb-3 sm:px-4">
                    <div className="flex items-start justify-between gap-1">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                          {kpi.label}
                        </p>
                        <p className={`text-lg sm:text-2xl font-bold tabular-nums truncate ${accentClass}`}>
                          {kpi.value}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="p-1.5 rounded-md bg-primary/10">
                          <kpi.icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <DeltaBadge delta={kpi.delta} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              {kpi.tooltip && (
                <TooltipContent side="bottom" className="max-w-[240px] whitespace-pre-line">
                  {kpi.tooltip}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
});

export { DashboardCeoStrip };
