import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStrategicKPI } from "@/components/marketing/dashboard/DashboardStrategicKPI";
import { DashboardKPICards } from "@/components/marketing/dashboard/DashboardKPICards";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabPanoramica = memo(function TabPanoramica({ data, isLoading }: Props) {
  return (
    <div className="space-y-4">
      {/* Hero KPI */}
      <DashboardStrategicKPI kpi={data?.kpi} kpiPrev={data?.kpi_prev} isLoading={isLoading} />

      {/* KPI secondari */}
      <DashboardKPICards kpi={data?.kpi} kpiPrev={data?.kpi_prev} isLoading={isLoading} />

      {/* Funnel + Team compatto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funnel</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DashboardFunnel funnel={data?.funnel} isLoading={isLoading} compact />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Team</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DashboardSalesTable sales={data?.sales_performance} isLoading={isLoading} compact />
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
