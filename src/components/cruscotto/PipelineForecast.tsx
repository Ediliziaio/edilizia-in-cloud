import { memo } from "react";
import { DashboardForecast } from "@/components/marketing/dashboard/DashboardForecast";
import type { KpiData, FunnelStage } from "@/hooks/useMarketingDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCur } from "@/components/marketing/dashboard/utils";

interface Props {
  kpi: KpiData | undefined;
  funnel: FunnelStage[] | undefined;
  isLoading: boolean;
}

export const PipelineForecast = memo(function PipelineForecast({ kpi, funnel, isLoading }: Props) {
  const weightedPipeline = Number(kpi?.weighted_pipeline ?? 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pipeline & Forecast</h3>

      {/* Weighted pipeline value */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pipeline Pesata (Probabilistica)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-8 w-32" /> : (
            <div className="text-2xl font-bold tabular-nums text-primary">{fmtCur(weightedPipeline)}</div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Valore ponderato per probabilità di chiusura per fase
          </p>
        </CardContent>
      </Card>

      {/* Funnel value per stage */}
      {!isLoading && funnel && funnel.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Valore per Fase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funnel.map(stage => (
              <div key={stage.stage_id} className="flex items-center justify-between py-1">
                <span className="text-sm">{stage.name}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold tabular-nums">{fmtCur(stage.total_value)}</span>
                  <span className="text-xs text-muted-foreground ml-2">({stage.count})</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <DashboardForecast kpi={kpi} isLoading={isLoading} />
    </div>
  );
});
