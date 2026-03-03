import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CalendarX, TrendingDown, Target, Timer } from "lucide-react";
import type { AlertsData } from "@/hooks/useMarketingDashboard";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  alerts: AlertsData | undefined;
  isLoading: boolean;
}

type Severity = "critical" | "warning" | "info";

interface AlertItem {
  key: string;
  icon: React.ElementType;
  label: string;
  count: number | boolean;
  severity: Severity;
  onClick?: () => void;
}

export function DashboardAlerts({ alerts, isLoading }: Props) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Alert Operativi</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const items: AlertItem[] = [
    // Critical
    {
      key: "stale_leads",
      icon: Clock,
      label: "Lead non contattati da 48h+",
      count: alerts?.stale_leads ?? 0,
      severity: "critical",
      onClick: () => navigate("/azienda/marketing/contatti"),
    },
    {
      key: "stale_opportunities",
      icon: AlertTriangle,
      label: "Opportunità ferme da 7+ giorni",
      count: alerts?.stale_opportunities ?? 0,
      severity: "critical",
      onClick: () => navigate("/azienda/marketing/opportunita"),
    },
    // Warning
    {
      key: "stale_leads_2h",
      icon: Timer,
      label: "Lead non contattati entro 2h",
      count: alerts?.stale_leads_2h ?? 0,
      severity: "warning",
      onClick: () => navigate("/azienda/marketing/contatti"),
    },
    {
      key: "show_rate_below",
      icon: Target,
      label: "Show rate sotto soglia (< 60%)",
      count: alerts?.show_rate_below_threshold ?? false,
      severity: "warning",
    },
    {
      key: "pipeline_declining",
      icon: TrendingDown,
      label: "Pipeline in calo vs periodo precedente",
      count: alerts?.pipeline_declining ?? false,
      severity: "warning",
    },
    // Info
    {
      key: "pending_appointments",
      icon: CalendarX,
      label: "Appuntamenti passati senza esito",
      count: alerts?.pending_appointments ?? 0,
      severity: "info",
      onClick: () => navigate("/azienda/marketing/calendario"),
    },
  ];

  const activeAlerts = items.filter(i => {
    if (typeof i.count === "boolean") return i.count;
    return i.count > 0;
  });

  const bySeverity = (s: Severity) => activeAlerts.filter(a => a.severity === s);
  const criticals = bySeverity("critical");
  const warnings = bySeverity("warning");
  const infos = bySeverity("info");

  const severityConfig = {
    critical: { color: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/40", iconColor: "text-red-600 dark:text-red-400", badge: "destructive" as const, dot: "🟥" },
    warning: { color: "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40", iconColor: "text-amber-600 dark:text-amber-400", badge: "secondary" as const, dot: "🟧" },
    info: { color: "border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40", iconColor: "text-blue-600 dark:text-blue-400", badge: "secondary" as const, dot: "🟩" },
  };

  const renderGroup = (title: string, items: AlertItem[], severity: Severity) => {
    if (items.length === 0) return null;
    const cfg = severityConfig[severity];
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cfg.dot} {title}</div>
        {items.map(a => {
          const Icon = a.icon;
          const displayCount = typeof a.count === "boolean" ? null : a.count;
          return (
            <button
              key={a.key}
              onClick={a.onClick}
              disabled={!a.onClick}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                cfg.color,
                a.onClick && "hover:opacity-80 cursor-pointer",
                !a.onClick && "cursor-default"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", cfg.iconColor)} />
              <span className="text-sm flex-1">{a.label}</span>
              {displayCount !== null && <Badge variant={cfg.badge} className="text-xs">{displayCount}</Badge>}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">Alert Operativi</CardTitle>
          </div>
          {activeAlerts.length > 0 && (
            <Badge variant={criticals.length > 0 ? "destructive" : "secondary"} className="text-xs">{activeAlerts.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">✅ Nessun alert attivo — tutto sotto controllo</p>
        ) : (
          <div className="space-y-4">
            {renderGroup("Critico", criticals, "critical")}
            {renderGroup("Attenzione", warnings, "warning")}
            {renderGroup("Informativo", infos, "info")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
