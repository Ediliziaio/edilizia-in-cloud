import { memo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Timer, CalendarX, Target, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertsData } from "@/hooks/useMarketingDashboard";
import { useNavigate } from "react-router-dom";

interface Props {
  alerts: AlertsData | undefined;
  isLoading: boolean;
}

interface AlertItem {
  key: string;
  icon: React.ElementType;
  label: string;
  count: number | boolean;
  severity: "critical" | "warning";
  path?: string;
}

export const AlertBanner = memo(function AlertBanner({ alerts, isLoading }: Props) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  if (isLoading || !alerts) return null;

  const items: AlertItem[] = [
    { key: "stale_leads", icon: Clock, label: "Lead non contattati 48h+", count: alerts.stale_leads, severity: "critical", path: "/azienda/marketing/contatti" },
    { key: "stale_opp", icon: AlertTriangle, label: "Opportunità ferme 7+ gg", count: alerts.stale_opportunities, severity: "critical", path: "/azienda/marketing/opportunita" },
    { key: "stale_2h", icon: Timer, label: "Lead non contattati entro 2h", count: alerts.stale_leads_2h, severity: "warning", path: "/azienda/marketing/contatti" },
    { key: "show_rate", icon: Target, label: "Show rate sotto soglia", count: alerts.show_rate_below_threshold, severity: "warning" },
    { key: "pipeline_dec", icon: TrendingDown, label: "Pipeline in calo", count: alerts.pipeline_declining, severity: "warning" },
    { key: "pending_appt", icon: CalendarX, label: "Appuntamenti senza esito", count: alerts.pending_appointments, severity: "warning", path: "/azienda/marketing/calendario" },
  ];

  const active = items.filter(i => typeof i.count === "boolean" ? i.count : (i.count as number) > 0);
  const criticals = active.filter(a => a.severity === "critical");

  if (active.length === 0) return null;

  const isCritical = criticals.length > 0;

  return (
    <div className={cn(
      "rounded-lg border px-4 py-2.5 transition-colors",
      isCritical
        ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/40"
        : "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn("h-4 w-4", isCritical ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")} />
          <span className="text-sm font-semibold">
            {active.length} alert attiv{active.length === 1 ? "o" : "i"}
          </span>
          {!expanded && (
            <div className="flex gap-1.5 ml-2">
              {active.slice(0, 3).map(a => {
                const Icon = a.icon;
                return (
                  <Badge key={a.key} variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] gap-1 py-0">
                    <Icon className="h-3 w-3" />
                    {typeof a.count === "number" ? a.count : "!"}
                  </Badge>
                );
              })}
              {active.length > 3 && <Badge variant="secondary" className="text-[10px] py-0">+{active.length - 3}</Badge>}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {active.map(a => {
            const Icon = a.icon;
            const displayCount = typeof a.count === "boolean" ? null : a.count;
            return (
              <button
                key={a.key}
                onClick={a.path ? () => navigate(a.path!) : undefined}
                disabled={!a.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-left transition-colors",
                  a.severity === "critical" ? "bg-red-100/60 dark:bg-red-900/30" : "bg-amber-100/60 dark:bg-amber-900/30",
                  a.path && "hover:opacity-80 cursor-pointer",
                  !a.path && "cursor-default"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0",
                  a.severity === "critical" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                )} />
                <span className="flex-1">{a.label}</span>
                {displayCount !== null && <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="text-[10px] h-4 px-1">{displayCount}</Badge>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
