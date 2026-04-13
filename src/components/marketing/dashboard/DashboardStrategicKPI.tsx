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
  borderClass: string;
  progressClass: string;
}

const STRATEGIC_CARDS: StrategicCard[] = [
  { key: "revenue", label: "Fatturato", tooltip: "Somma valori opportunità vinte nel periodo", icon: Euro, format: "currency", target: 50000, accentClass: "text-emerald-600 dark:text-emerald-400", borderClass: "border-l-emerald-500", progressClass: "[&>div]:bg-emerald-500" },
  { key: "contracts_won", label: "Contratti Vinti", tooltip: "Opportunità chiuse con successo", icon: Trophy, format: "number", target: 10, accentClass: "text-amber-600 dark:text-amber-400", borderClass: "border-l-amber-500", progressClass: "[&>div]:bg-amber-500" },
  { key: "pipeline_active_value", label: "Pipeline Attiva", tooltip: "Valore totale opportunità aperte", icon: BarChart3, format: "currency", accentClass: "text-blue-600 dark:text-blue-400", borderClass: "border-l-blue-500", progressClass: "[&>div]:bg-blue-500" },
  { key: "forecast_30d", label: "Forecast 30gg", tooltip: "Stima: tasso chiusura × ticket medio × opportunità in fasi avanzate", icon: Zap, format: "currency", accentClass: "text-violet-600 dark:text-violet-400", borderClass: "border-l-violet-500", progressClass: "[&>div]:bg-violet-500" },
  { key: "close_rate", label: "Tasso Chiusura", tooltip: "Contratti vinti / Appuntamenti svolti × 100", icon: Target, format: "percent", target: 30, accentClass: "text-rose-600 dark:text-rose-400", borderClass: "border-l-rose-500", progressClass: "[&>div]:bg-rose-500" },
  { key: "show_rate", label: "Show Rate", tooltip: "Appuntamenti svolti / fissati × 100", icon: CalendarCheck, format: "percent", target: 75, accentClass: "text-cyan-600 dark:text-cyan-400", borderClass: "border-l-cyan-500", progressClass: "[&>div]:bg-cyan-500" },
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
                <Card className={cn("p-3 sm:p-5 hover:shadow-lg transition-all duration-200 cursor-default border-l-4 overflow-hidden", c.borderClass)}>
                  <div className="flex items-center justify-between mb-1 sm:mb-2 gap-1">
                    <span className="text-[9px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{c.label}</span>
                    <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0", c.accentClass)} />
                  </div>
                  <div className="text-lg sm:text-2xl lg:text-3xl font-black tracking-tight mb-0.5 sm:mb-1 truncate">{formatValue(value, c.format)}</div>
                  <div className={cn("flex items-center gap-1 text-[9px] sm:text-xs font-semibold mb-1 sm:mb-2",
                    delta.direction === "up" && "text-emerald-600 dark:text-emerald-400",
                    delta.direction === "down" && "text-red-600 dark:text-red-400",
                    delta.direction === "flat" && "text-muted-foreground"
                  )}>
                    {delta.direction === "up" && <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />}
                    {delta.direction === "down" && <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />}
                    {delta.direction === "flat" && <Minus className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />}
                    <span className="truncate">{delta.value}% vs prec.</span>
                  </div>
                  {targetPct !== null && (
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="flex justify-between text-[9px] sm:text-[10px] text-muted-foreground gap-1">
                        <span className="truncate">Target: {formatValue(c.target!, c.format)}</span>
                        <span className="flex-shrink-0">{Math.round(targetPct)}%</span>
                      </div>
                      <Progress value={targetPct} className={cn("h-1.5", c.progressClass)} />
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
