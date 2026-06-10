import { memo, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FunnelChart, type FunnelChartStage } from "@/components/ui/funnel-chart";
import type { FunnelStage } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { fmtCur } from "./utils";

interface Props {
  funnel: FunnelStage[] | undefined;
  isLoading: boolean;
  compact?: boolean;
}

/** Palette funnel: ciclo sulle chart vars del tema (coerente con gli altri grafici). */
const STAGE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export const DashboardFunnel = memo(function DashboardFunnel({ funnel, isLoading, compact }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const stages = funnel || [];

  // Collo di bottiglia: stage con la conversione più bassa (escluso il primo)
  const bottleneckIdx = useMemo(() => {
    let idx = -1;
    let lowestConv = Infinity;
    stages.forEach((stage, i) => {
      if (i === 0) return;
      const prevCount = stages[i - 1].count;
      if (prevCount > 0) {
        const conv = stage.count / prevCount;
        if (conv < lowestConv && prevCount >= 2) {
          lowestConv = conv;
          idx = i;
        }
      }
    });
    return idx;
  }, [stages]);

  const chartData: FunnelChartStage[] = useMemo(
    () =>
      stages.map((stage, i) => ({
        label: stage.name,
        value: stage.count,
        color: i === bottleneckIdx ? "hsl(var(--destructive))" : STAGE_COLORS[i % STAGE_COLORS.length],
      })),
    [stages, bottleneckIdx],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Pipeline</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const Wrapper = compact ? "div" : Card;
  const wrapperProps = compact ? { className: "" } : {};

  return (
    <Wrapper {...wrapperProps}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pipeline</CardTitle>
        </CardHeader>
      )}
      <CardContent className={compact ? "p-0" : ""}>
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessuno stage configurato</p>
        ) : (
          <div className="space-y-3">
            <FunnelChart
              data={chartData}
              hoveredIndex={hovered}
              onHoverChange={setHovered}
              layers={3}
              gap={compact ? 2 : 4}
              showLabels={!compact}
              showValues
              showPercentage={!compact}
              labelLayout={compact ? "grouped" : "spread"}
              style={{ aspectRatio: compact ? "2.6 / 1" : "2.2 / 1" }}
            />

            {/* Dettaglio per fase: valore €, conversione, giorni medi.
                Le righe si illuminano in sync con l'hover del funnel. */}
            <div className={cn("space-y-1", compact && "hidden")}>
              {stages.map((stage, idx) => {
                const prevCount = idx > 0 ? stages[idx - 1].count : null;
                const convRate = prevCount && prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : null;
                const isBottleneck = idx === bottleneckIdx;
                const dotColor = isBottleneck ? "hsl(var(--destructive))" : STAGE_COLORS[idx % STAGE_COLORS.length];

                return (
                  <div
                    key={stage.stage_id}
                    onMouseEnter={() => setHovered(idx)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors cursor-default",
                      hovered === idx && "bg-muted/60",
                      hovered !== null && hovered !== idx && "opacity-50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                      <span className={cn("font-medium truncate", isBottleneck && "text-red-600 dark:text-red-400")}>
                        {stage.name}
                      </span>
                      {isBottleneck && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 text-muted-foreground tabular-nums">
                      {stage.avg_days_in_stage > 0 && (
                        <span className="hidden sm:inline text-[10px]">{stage.avg_days_in_stage}gg</span>
                      )}
                      {convRate !== null && (
                        <span className={cn("text-[10px]", isBottleneck && "text-red-600 dark:text-red-400 font-semibold")}>
                          {convRate}%
                        </span>
                      )}
                      {stage.total_value > 0 && (
                        <span className="hidden sm:inline text-[10px]">{fmtCur(stage.total_value)}</span>
                      )}
                      <span className="font-semibold text-foreground">{stage.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {bottleneckIdx >= 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Possibile collo di bottiglia in "{stages[bottleneckIdx].name}" — conversione più bassa del funnel.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Wrapper>
  );
});
