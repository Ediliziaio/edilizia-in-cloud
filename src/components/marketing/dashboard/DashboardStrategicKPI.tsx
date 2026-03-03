import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Euro, Trophy, Target, CalendarCheck, BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiData } from "@/hooks/useMarketingDashboard";
import { formatValue, calcDelta } from "./utils";

interface Props {
  kpi: KpiData | undefined;
  kpiPrev: KpiData | undefined;
  isLoading: boolean;
}

interface StrategicCard {
  key: keyof KpiData;
  label: string;
  tooltip: string;
  icon: React.ElementType;
  format: "currency" | "number" | "percent";
  target?: number;
  accentClass: string;
}

const STRATEGIC_CARDS: StrategicCard[] = [
  { key: "revenue", label: "Fatturato", tooltip: "Somma valori opportunità vinte nel periodo", icon: Euro, format: "currency", target: 50000, accentClass: "text-emerald-600 dark:text-emerald-400" },
  { key: "contracts_won", label: "Contratti Vinti", tooltip: "Opportunità chiuse con successo", icon: Trophy, format: "number", target: 10, accentClass: "text-amber-600 dark:text-amber-400" },
  { key: "pipeline_active_value", label: "Pipeline Attiva", tooltip: "Valore totale opportunità aperte", icon: BarChart3, format: "currency", accentClass: "text-blue-600 dark:text-blue-400" },
  { key: "forecast_30d", label: "Forecast 30gg", tooltip: "Stima: tasso chiusura × ticket medio × opportunità in fasi avanzate", icon: Zap, format: "currency", accentClass: "text-violet-600 dark:text-violet-400" },
  { key: "close_rate", label: "Tasso Chiusura", tooltip: "Contratti vinti / Appuntamenti svolti × 100", icon: Target, format: "percent", target: 30, accentClass: "text-rose-600 dark:text-rose-400" },
  { key: "show_rate", label: "Show Rate", tooltip: "Appuntamenti svolti / fissati × 100", icon: CalendarCheck, format: "percent", target: 75, accentClass: "text-cyan-600 dark:text-cyan-400" },
];

export const DashboardStrategicKPI = memo(function DashboardStrategicKPI({ kpi, kpiPrev, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {STRATEGIC_CARDS.map(c => (
          <Card key={c.key} className="p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-10 w-20 mb-2" />
            <Skeleton className="h-2 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {STRATEGIC_CARDS.map(c => {
          const value = Number(kpi?.[c.key] ?? 0);
          const prevValue = Number(kpiPrev?.[c.key] ?? 0);
          const delta = calcDelta(value, prevValue);
          const Icon = c.icon;
          const targetPct = c.target ? Math.min((value / c.target) * 100, 100) : null;

          return (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>
                <Card className="p-5 hover:shadow-lg transition-all duration-200 cursor-default border-l-4 border-l-transparent hover:border-l-primary">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</span>
                    <Icon className={cn("h-5 w-5", c.accentClass)} />
                  </div>
                  <div className="text-3xl font-black tracking-tight mb-1">{formatValue(value, c.format)}</div>
                  <div className={cn("flex items-center gap-1 text-xs font-semibold mb-2",
                    delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                    delta.direction === "down" && "text-red-600 dark:text-red-400",
                    delta.direction === "flat" && "text-muted-foreground"
                  )}>
                    {delta.direction === "up" && <TrendingUp className="h-3.5 w-3.5" />}
                    {delta.direction === "down" && <TrendingDown className="h-3.5 w-3.5" />}
                    {delta.direction === "flat" && <Minus className="h-3.5 w-3.5" />}
                    {delta.value}% vs periodo prec.
                  </div>
                  {targetPct !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Target: {formatValue(c.target!, c.format)}</span>
                        <span>{Math.round(targetPct)}%</span>
                      </div>
                      <Progress value={targetPct} className="h-1.5" />
                    </div>
                  )}
                </Card>
              </TooltipTrigger>
              <TooltipContent><p>{c.tooltip}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
});
