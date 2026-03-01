import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { CompanyHealthScore } from "@/hooks/useAdminRevenueData";

interface Props {
  healthSummary: { healthy: number; atRisk: number; critical: number };
  topAtRisk: CompanyHealthScore[];
}

export function AdminHealthSummary({ healthSummary, topAtRisk }: Props) {
  const total = healthSummary.healthy + healthSummary.atRisk + healthSummary.critical;
  const healthyPct = total > 0 ? Math.round((healthSummary.healthy / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Health Score Tenant</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary badges */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
            <CheckCircle className="h-5 w-5 text-emerald-600 mb-1" />
            <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{healthSummary.healthy}</span>
            <span className="text-xs text-muted-foreground">Healthy</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 mb-1" />
            <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">{healthSummary.atRisk}</span>
            <span className="text-xs text-muted-foreground">At Risk</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
            <XCircle className="h-5 w-5 text-red-600 mb-1" />
            <span className="text-2xl font-bold text-red-700 dark:text-red-400">{healthSummary.critical}</span>
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
        </div>

        {/* Overall health bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Salute complessiva</span>
            <span className="text-xs font-medium">{healthyPct}%</span>
          </div>
          <Progress value={healthyPct} className="h-2" />
        </div>

        {/* Top at-risk companies */}
        {topAtRisk.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aziende a rischio
            </p>
            {topAtRisk.slice(0, 4).map((c) => (
              <div key={c.companyId} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1">{c.companyName}</span>
                <Badge
                  variant={c.health === "critical" ? "destructive" : "secondary"}
                  className="text-xs ml-2"
                >
                  {c.score}pts
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
