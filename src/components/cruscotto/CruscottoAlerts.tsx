import { memo } from "react";
import { AlertTriangle, Clock, CreditCard, TrendingDown, Users, CalendarCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { AlertsData } from "@/hooks/useMarketingDashboard";
import type { OperationsData, FinanceData, CompanyTargets } from "@/hooks/useCruscottoData";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertThresholdsDialog } from "./AlertThresholdsDialog";

interface Props {
  marketingAlerts: AlertsData | undefined;
  operations: OperationsData;
  finance: FinanceData;
  isLoading: boolean;
  companyTargets?: CompanyTargets | null;
}

interface AlertItem {
  id: string;
  level: "critical" | "warning" | "info";
  icon: React.ElementType;
  message: string;
  action?: string;
  link?: string;
}

export const CruscottoAlerts = memo(function CruscottoAlerts({ marketingAlerts, operations, finance, isLoading, companyTargets }: Props) {
  if (isLoading) {
    return <Skeleton className="h-12 w-full rounded-lg" />;
  }

  const thresholds = {
    lateOrders: companyTargets?.alert_late_orders_threshold ?? 1,
    openTickets: companyTargets?.alert_open_tickets_threshold ?? 5,
    marginMin: companyTargets?.alert_margin_min_pct ?? 10,
    runwayDays: companyTargets?.alert_runway_days_warning ?? 30,
  };

  const alerts: AlertItem[] = [];

  // Marketing alerts
  if (marketingAlerts) {
    if (marketingAlerts.stale_leads > 0) {
      alerts.push({
        id: "stale-leads",
        level: "critical",
        icon: Users,
        message: `${marketingAlerts.stale_leads} lead non contattati da 48h+`,
        action: "Assegnare follow-up immediato",
        link: "/azienda/marketing/contatti",
      });
    }
    if (marketingAlerts.stale_leads_2h > 0) {
      alerts.push({
        id: "stale-leads-2h",
        level: "info",
        icon: Clock,
        message: `${marketingAlerts.stale_leads_2h} lead nuovi non contattati da 2h`,
        action: "Contattare prima che diventino freddi",
        link: "/azienda/marketing/contatti",
      });
    }
    if (marketingAlerts.pending_appointments > 0) {
      alerts.push({
        id: "pending-appointments",
        level: "warning",
        icon: CalendarCheck,
        message: `${marketingAlerts.pending_appointments} appuntamenti passati non completati`,
        action: "Aggiornare stato o riprogrammare",
        link: "/azienda/marketing/calendario",
      });
    }
    if (marketingAlerts.stale_opportunities > 0) {
      alerts.push({
        id: "stale-opps",
        level: "warning",
        icon: Clock,
        message: `${marketingAlerts.stale_opportunities} opportunità ferme da 7+ giorni`,
        action: "Aggiornare stato o ricontattare",
        link: "/azienda/marketing/opportunita",
      });
    }
    if (marketingAlerts.show_rate_below_threshold) {
      alerts.push({
        id: "show-rate",
        level: "warning",
        icon: TrendingDown,
        message: "Show rate sotto il 60%",
        action: "Rivedere qualifica lead e promemoria",
        link: "/azienda/marketing",
      });
    }
    if (marketingAlerts.pipeline_declining) {
      alerts.push({
        id: "pipeline-decline",
        level: "warning",
        icon: TrendingDown,
        message: "Pipeline in calo rispetto al periodo precedente",
        action: "Incrementare attività di lead generation",
        link: "/azienda/marketing",
      });
    }
  }

  // Operations alerts — using configurable thresholds
  if (operations.overduePayments > 0) {
    alerts.push({
      id: "overdue-payments",
      level: "critical",
      icon: CreditCard,
      message: `${operations.overduePayments} pagamenti scaduti (€${Math.round(operations.overdueAmount).toLocaleString("it-IT")})`,
      action: "Sollecitare incassi urgenti",
      link: "/azienda/ordini",
    });
  }
  if (operations.lateOrders >= thresholds.lateOrders) {
    alerts.push({
      id: "late-orders",
      level: "warning",
      icon: AlertTriangle,
      message: `${operations.lateOrders} ordini in ritardo`,
      action: "Verificare stato lavori e pianificazione",
      link: "/azienda/ordini",
    });
  }

  // Finance alerts
  if (finance.cashFlowNet < 0) {
    alerts.push({
      id: "negative-cash",
      level: "critical",
      icon: TrendingDown,
      message: "Cash flow negativo questo mese",
      action: "Sollecitare incassi o posticipare uscite",
      link: "/azienda/costi",
    });
  }

  // Sort: critical first, then warning, then info
  const sortedAlerts = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {sortedAlerts.length > 0 && (
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {sortedAlerts.length} Alert{sortedAlerts.length > 1 ? "s" : ""}
          </span>
        )}
        <AlertThresholdsDialog targets={companyTargets || null} />
      </div>
      {sortedAlerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sortedAlerts.map(alert => {
            const Icon = alert.icon;
            const content = (
              <div
                className={cn(
                  "flex items-start gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  alert.level === "critical" && "bg-destructive/10 text-destructive hover:bg-destructive/20",
                  alert.level === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
                  alert.level === "info" && "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span>{alert.message}</span>
                  {alert.action && (
                    <div className="text-xs font-normal opacity-75 mt-0.5">→ {alert.action}</div>
                  )}
                </div>
              </div>
            );

            return alert.link ? (
              <Link key={alert.id} to={alert.link}>{content}</Link>
            ) : (
              <div key={alert.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
});
