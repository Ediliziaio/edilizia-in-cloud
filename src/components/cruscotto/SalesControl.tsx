import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import type { SalesPerformance, KpiData } from "@/hooks/useMarketingDashboard";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Clock } from "lucide-react";

interface Props {
  sales: SalesPerformance[] | undefined;
  kpi: KpiData | undefined;
  isLoading: boolean;
}

export const SalesControl = memo(function SalesControl({ sales, kpi, isLoading }: Props) {
  const pipeline = Number(kpi?.pipeline_active_value ?? 0);
  const forecast30 = Number(kpi?.forecast_30d ?? 0);
  const avgCycle = Number(kpi?.avg_lead_to_won_days ?? 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sales Control</h3>

      {/* Sales KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Pipeline Attiva</span>
          </div>
          {isLoading ? <Skeleton className="h-6 w-20" /> : (
            <div className="text-lg font-bold tabular-nums">{fmtCur(pipeline)}</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Forecast 30gg</span>
          </div>
          {isLoading ? <Skeleton className="h-6 w-20" /> : (
            <div className="text-lg font-bold tabular-nums">{fmtCur(forecast30)}</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Ciclo Medio</span>
          </div>
          {isLoading ? <Skeleton className="h-6 w-20" /> : (
            <div className="text-lg font-bold tabular-nums">{avgCycle.toFixed(0)}gg</div>
          )}
        </Card>
      </div>

      <DashboardSalesTable sales={sales} isLoading={isLoading} />
    </div>
  );
});
