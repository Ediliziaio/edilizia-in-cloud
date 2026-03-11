import { memo } from "react";
import { Card } from "@/components/ui/card";
import { DashboardSourcesTable } from "@/components/marketing/dashboard/DashboardSourcesTable";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { BarChart3, TrendingUp } from "lucide-react";
import { fmtCur } from "@/components/marketing/dashboard/utils";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabFonti = memo(function TabFonti({ data, isLoading }: Props) {
  const sources = data?.sources || [];
  const totalLeads = sources.reduce((s, r) => s + r.leads, 0);
  const totalRevenue = sources.reduce((s, r) => s + r.revenue, 0);
  const totalSpend = sources.reduce((s, r) => s + r.spend, 0);
  const bestSource = sources.length > 0
    ? sources.reduce((a, b) => a.revenue > b.revenue ? a : b)
    : null;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">Fonti Attive</span>
          </div>
          <div className="text-2xl font-bold">{sources.length}</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Lead Totali</span>
          <div className="text-2xl font-bold">{totalLeads}</div>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Fatturato</span>
          <div className="text-2xl font-bold">{fmtCur(totalRevenue)}</div>
        </Card>
        {totalSpend > 0 ? (
          <Card className="p-4">
            <span className="text-xs text-muted-foreground">Spesa Totale</span>
            <div className="text-2xl font-bold">{fmtCur(totalSpend)}</div>
          </Card>
        ) : bestSource ? (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Miglior Fonte</span>
            </div>
            <div className="text-lg font-bold truncate">{bestSource.source}</div>
          </Card>
        ) : null}
      </div>

      {/* Full table */}
      <DashboardSourcesTable sources={data?.sources} isLoading={isLoading} />
    </div>
  );
});
