import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Timer, AlertTriangle, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { AdminMrrStats as MrrStatsType } from "@/hooks/useAdminDashboardData";

interface Props {
  mrrStats: MrrStatsType;
}

export function AdminMrrStats({ mrrStats }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">MRR</CardTitle>
          <div className="p-2 rounded-lg bg-emerald-100">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatCurrency(mrrStats.mrr)}</div>
          <p className="text-xs text-muted-foreground mt-1">Ricavo mensile ricorrente</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Aziende in Trial</CardTitle>
          <div className="p-2 rounded-lg bg-blue-100">
            <Timer className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{mrrStats.trialCount}</div>
          <p className="text-xs text-muted-foreground mt-1">In periodo di prova</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Trial in Scadenza</CardTitle>
          <div className={`p-2 rounded-lg ${mrrStats.trialExpiringSoon > 0 ? "bg-amber-100" : "bg-muted"}`}>
            <AlertTriangle className={`h-4 w-4 ${mrrStats.trialExpiringSoon > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
          </div>
        </CardHeader>
        <CardContent>
          <div className={`text-3xl font-bold ${mrrStats.trialExpiringSoon > 0 ? "text-amber-600" : ""}`}>
            {mrrStats.trialExpiringSoon}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Scadono entro 3 giorni</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Tasso Churn</CardTitle>
          <div className="p-2 rounded-lg bg-muted">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{mrrStats.churnRate}%</div>
          <p className="text-xs text-muted-foreground mt-1">Tasso di abbandono</p>
        </CardContent>
      </Card>
    </div>
  );
}
