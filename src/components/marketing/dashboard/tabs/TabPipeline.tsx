import { memo } from "react";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardForecast } from "@/components/marketing/dashboard/DashboardForecast";
import { DashboardInsights } from "@/components/marketing/dashboard/DashboardInsights";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabPipeline = memo(function TabPipeline({ data, isLoading }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardFunnel funnel={data?.funnel} isLoading={isLoading} />
        <DashboardForecast kpi={data?.kpi} isLoading={isLoading} />
      </div>
      <DashboardInsights
        kpi={data?.kpi}
        kpiPrev={data?.kpi_prev}
        sales={data?.sales_performance}
        sources={data?.sources}
        alerts={data?.alerts}
        isLoading={isLoading}
      />
    </div>
  );
});
