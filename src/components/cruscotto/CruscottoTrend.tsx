import { memo } from "react";
import { DashboardTrendChart } from "@/components/marketing/dashboard/DashboardTrendChart";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { TrendPoint } from "@/hooks/useMarketingDashboard";

interface Props {
  trend: TrendPoint[] | undefined;
  isLoading: boolean;
}

export const CruscottoTrend = memo(function CruscottoTrend({ trend, isLoading }: Props) {
  const isEmpty = !isLoading && (!trend || trend.length === 0);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Trend Temporale</h3>
      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Dati insufficienti per mostrare il trend</p>
            <p className="text-xs text-muted-foreground/60 mt-1">I dati appariranno dopo aver registrato attività nel periodo selezionato</p>
          </CardContent>
        </Card>
      ) : (
        <DashboardTrendChart trend={trend} isLoading={isLoading} />
      )}
    </div>
  );
});
