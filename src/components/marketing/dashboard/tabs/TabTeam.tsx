import { memo } from "react";
import { Card } from "@/components/ui/card";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { Trophy, Users, Target } from "lucide-react";
import { fmtCur } from "@/components/marketing/dashboard/utils";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabTeam = memo(function TabTeam({ data, isLoading }: Props) {
  const sales = data?.sales_performance || [];
  const totalRevenue = sales.reduce((s, r) => s + r.revenue, 0);
  const totalWon = sales.reduce((s, r) => s + r.contracts_won, 0);
  const avgCloseRate = sales.length > 0
    ? Math.round(sales.reduce((s, r) => s + (r.appointments_done > 0 ? (r.contracts_won / r.appointments_done) * 100 : 0), 0) / sales.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">Team</span>
          </div>
          <div className="text-2xl font-bold">{sales.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">Contratti Vinti</span>
          </div>
          <div className="text-2xl font-bold">{totalWon}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">Fatturato Totale</span>
          </div>
          <div className="text-2xl font-bold">{fmtCur(totalRevenue)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">Chiusura Media</span>
          </div>
          <div className="text-2xl font-bold">{avgCloseRate}%</div>
        </Card>
      </div>

      {/* Full table */}
      <DashboardSalesTable sales={data?.sales_performance} isLoading={isLoading} />
    </div>
  );
});
