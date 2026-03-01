import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, ClipboardList, Users } from "lucide-react";
import type { UpsellAlert } from "@/hooks/useAdminRevenueData";

interface Props {
  alerts: UpsellAlert[];
}

export function AdminUpsellAlerts({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upsell Alerts</CardTitle>
          <CardDescription>Nessun tenant vicino ai limiti del piano</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Upsell Alerts
          <Badge variant="secondary" className="text-[10px]">{alerts.length}</Badge>
        </CardTitle>
        <CardDescription>Tenant che si avvicinano ai limiti del piano (≥70%)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.slice(0, 10).map((alert) => (
          <div key={`${alert.companyId}-${alert.metric}`} className="flex items-center gap-3 rounded-lg border p-3">
            <div className="p-2 rounded-md bg-muted">
              {alert.metric === "orders" ? (
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Users className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{alert.companyName}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">{alert.planName}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Progress
                  value={Math.min(alert.pct, 100)}
                  className="h-2 flex-1"
                />
                <span className={`text-xs font-medium whitespace-nowrap ${
                  alert.pct >= 90 ? "text-destructive" : "text-amber-600"
                }`}>
                  {alert.current}/{alert.limit} {alert.metric === "orders" ? "ordini" : "utenti"} ({alert.pct}%)
                </span>
              </div>
            </div>
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/admin/aziende/${alert.companyId}`}>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
