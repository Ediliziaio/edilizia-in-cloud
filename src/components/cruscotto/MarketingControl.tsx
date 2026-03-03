import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardSourcesTable } from "@/components/marketing/dashboard/DashboardSourcesTable";
import type { FunnelStage, SourceAnalysis } from "@/hooks/useMarketingDashboard";

interface Props {
  sources: SourceAnalysis[] | undefined;
  funnel: FunnelStage[] | undefined;
  isLoading: boolean;
}

export const MarketingControl = memo(function MarketingControl({ sources, funnel, isLoading }: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Marketing Control</h3>
      <DashboardFunnel funnel={funnel} isLoading={isLoading} />
      <DashboardSourcesTable sources={sources} isLoading={isLoading} />
    </div>
  );
});
