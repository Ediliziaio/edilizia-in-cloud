import { memo } from "react";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardForecast } from "@/components/marketing/dashboard/DashboardForecast";
import { DashboardInsights } from "@/components/marketing/dashboard/DashboardInsights";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { DashboardStats, DashboardFiltersState } from "@/hooks/useMarketingDashboard";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
  filters: DashboardFiltersState;
  onUpdateFilters: (partial: Partial<DashboardFiltersState>) => void;
}

export const TabPipeline = memo(function TabPipeline({ data, isLoading, filters, onUpdateFilters }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: pipelines } = useQuery({
    queryKey: ["dashboard-pipelines", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_pipelines")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 300_000,
  });

  return (
    <div className="space-y-6">
      {/* Pipeline selector */}
      {pipelines && pipelines.length > 0 && (
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <Select
            value={filters.pipelineId || "all"}
            onValueChange={(v) => onUpdateFilters({ pipelineId: v === "all" ? null : v })}
          >
            <SelectTrigger className="h-8 w-[240px] text-xs">
              <SelectValue placeholder="Seleziona pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le pipeline</SelectItem>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
