import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FunnelStage } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { fmtCur } from "./utils";

interface Props {
  funnel: FunnelStage[] | undefined;
  isLoading: boolean;
  compact?: boolean;
}

export const DashboardFunnel = memo(function DashboardFunnel({ funnel, isLoading, compact }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Funnel Pipeline</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const stages = funnel || [];
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  // Find bottleneck: stage with lowest conversion rate (excluding first stage)
  let bottleneckIdx = -1;
  let lowestConv = Infinity;
  stages.forEach((stage, idx) => {
    if (idx === 0) return;
    const prevCount = stages[idx - 1].count;
    if (prevCount > 0) {
      const conv = stage.count / prevCount;
      if (conv < lowestConv && prevCount >= 2) {
        lowestConv = conv;
        bottleneckIdx = idx;
      }
    }
  });

  const Wrapper = compact ? "div" : Card;
  const wrapperProps = compact ? { className: "" } : {};

  return (
    <TooltipProvider delayDuration={200}>
      <Wrapper {...wrapperProps}>
        {!compact && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funnel Pipeline</CardTitle>
          </CardHeader>
        )}
        <CardContent className={compact ? "p-0" : ""}>
          {stages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nessuno stage configurato</p>
          ) : (
            <div className={cn("space-y-2", compact && "space-y-1")}>
              {stages.map((stage, idx) => {
                const widthPct = Math.max((stage.count / maxCount) * 100, 8);
                const prevCount = idx > 0 ? stages[idx - 1].count : null;
                const convRate = prevCount && prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : null;
                const isBottleneck = idx === bottleneckIdx;

                return (
                  <Tooltip key={stage.stage_id}>
                    <TooltipTrigger asChild>
                      <div className="group cursor-default">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("font-medium truncate", isBottleneck && "text-red-600 dark:text-red-400")}>{stage.name}</span>
                            {isBottleneck && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                            {stage.avg_days_in_stage > 0 && (
                              <span className="text-[10px]">{stage.avg_days_in_stage}gg</span>
                            )}
                            {convRate !== null && (
                              <span className={cn("text-[10px]", isBottleneck && "text-red-600 dark:text-red-400 font-semibold")}>{convRate}% conv.</span>
                            )}
                            <span className="font-semibold text-foreground">{stage.count}</span>
                          </div>
                        </div>
                        <div className="h-7 bg-muted rounded-md overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-md transition-all duration-500 flex items-center px-2",
                              isBottleneck
                                ? "bg-red-500/80 group-hover:bg-red-500"
                                : "bg-primary/80 group-hover:bg-primary"
                            )}
                            style={{ width: `${widthPct}%` }}
                          >
                            {stage.total_value > 0 && (
                              <span className="text-[10px] text-primary-foreground font-medium truncate">
                                {fmtCur(stage.total_value)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs space-y-1">
                        <p><strong>{stage.name}</strong>: {stage.count} opportunità</p>
                        {stage.total_value > 0 && <p>Valore: {fmtCur(stage.total_value)}</p>}
                        {convRate !== null && <p>Conversione: {convRate}%</p>}
                        {stage.avg_days_in_stage > 0 && <p>Tempo medio in fase: {stage.avg_days_in_stage} giorni</p>}
                        {isBottleneck && <p className="text-red-500 font-semibold">⚠️ Possibile collo di bottiglia</p>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
});
