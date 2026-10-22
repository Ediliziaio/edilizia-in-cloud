import { memo } from "react";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardForecast } from "@/components/marketing/dashboard/DashboardForecast";
import { DashboardInsights } from "@/components/marketing/dashboard/DashboardInsights";
import { PercorsoLead } from "@/components/marketing/dashboard/PercorsoLead";
import type { DashboardStats, DashboardFiltersState } from "@/hooks/useMarketingDashboard";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

// La pipeline si sceglie nella barra dei filtri in alto: qui c'era un secondo
// selettore uguale.
export const TabPipeline = memo(function TabPipeline({ data, isLoading, filters, assignedUserIds }: Props) {
  return (
    <div className="space-y-6">
      <PercorsoLead filters={filters} assignedUserIds={assignedUserIds} />

      {/* Telefono: basta il percorso dei lead; foto della pipeline, forecast e
          suggerimenti sono analisi da computer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-sm:hidden">
        <DashboardFunnel funnel={data?.funnel} isLoading={isLoading} />
        <DashboardForecast kpi={data?.kpi} isLoading={isLoading} />
      </div>
      <div className="max-sm:hidden">
        <DashboardInsights
          kpi={data?.kpi}
          kpiPrev={data?.kpi_prev}
          sales={data?.sales_performance}
          sources={data?.sources}
          alerts={data?.alerts}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
});
