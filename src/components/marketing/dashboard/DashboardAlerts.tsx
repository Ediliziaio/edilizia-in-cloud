import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CalendarX } from "lucide-react";
import type { AlertsData } from "@/hooks/useMarketingDashboard";
import { useNavigate } from "react-router-dom";

interface Props {
  alerts: AlertsData | undefined;
  isLoading: boolean;
}

export function DashboardAlerts({ alerts, isLoading }: Props) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Alert Intelligenti</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const items = [
    {
      key: "stale_leads",
      icon: Clock,
      label: "Lead non contattati da 48h+",
      count: alerts?.stale_leads ?? 0,
      severity: "destructive" as const,
      onClick: () => navigate("/azienda/marketing/contatti"),
    },
    {
      key: "stale_opportunities",
      icon: AlertTriangle,
      label: "Opportunità ferme da 7+ giorni",
      count: alerts?.stale_opportunities ?? 0,
      severity: "destructive" as const,
      onClick: () => navigate("/azienda/marketing/opportunita"),
    },
    {
      key: "pending_appointments",
      icon: CalendarX,
      label: "Appuntamenti passati senza esito",
      count: alerts?.pending_appointments ?? 0,
      severity: "secondary" as const,
      onClick: () => navigate("/azienda/marketing/calendario"),
    },
  ];

  const activeAlerts = items.filter(i => i.count > 0);
  const totalAlerts = activeAlerts.reduce((s, a) => s + a.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">Alert Intelligenti</CardTitle>
          </div>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="text-xs">{totalAlerts}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">✅ Nessun alert attivo — tutto sotto controllo</p>
        ) : (
          <div className="space-y-2">
            {activeAlerts.map(a => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  onClick={a.onClick}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                >
                  <Icon className="h-4 w-4 text-destructive shrink-0" />
                  <span className="text-sm flex-1">{a.label}</span>
                  <Badge variant={a.severity} className="text-xs">{a.count}</Badge>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
