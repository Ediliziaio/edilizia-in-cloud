import { memo } from "react";
import { DashboardTrendChart } from "@/components/marketing/dashboard/DashboardTrendChart";
import type { TrendPoint } from "@/hooks/useMarketingDashboard";

interface Props {
  trend: TrendPoint[] | undefined;
  isLoading: boolean;
}

export const CruscottoTrend = memo(function CruscottoTrend({ trend, isLoading }: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Trend Temporale</h3>
      <DashboardTrendChart trend={trend} isLoading={isLoading} />
    </div>
  );
});
