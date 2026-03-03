import { memo } from "react";
import { AlertTriangle, Clock, CreditCard, TrendingDown, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { AlertsData } from "@/hooks/useMarketingDashboard";
import type { OperationsData, FinanceData } from "@/hooks/useCruscottoData";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  marketingAlerts: AlertsData | undefined;
  operations: OperationsData;
  finance: FinanceData;
  isLoading: boolean;
}

interface AlertItem {
  id: string;
  level: "critical" | "warning" | "info";
  icon: React.ElementType;
  message: string;
  link?: string;
}

export const CruscottoAlerts = memo(function CruscottoAlerts({ marketingAlerts, operations, finance, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-12 w-full rounded-lg" />;
  }

  const alerts: AlertItem[] = [];

  // Marketing alerts
  if (marketingAlerts) {
    if (marketingAlerts.stale_leads > 0) {
      alerts.push({
        id: "stale-leads",
        level: "critical",
        icon: Users,
        message: `${marketingAlerts.stale_leads} lead non contattati da 48h+`,
        link: "/azienda/marketing/contatti",
      });
    }
    if (marketingAlerts.stale_opportunities > 0) {
      alerts.push({
        id: "stale-opps",
        level: "warning",
        icon: Clock,
        message: `${marketingAlerts.stale_opportunities} opportunità ferme da 7+ giorni`,
        link: "/azienda/marketing/opportunita",
      });
    }
    if (marketingAlerts.show_rate_below_threshold) {
      alerts.push({
        id: "show-rate",
        level: "warning",
        icon: TrendingDown,
        message: "Show rate sotto il 60%",
        link: "/azienda/marketing",
      });
    }
    if (marketingAlerts.pipeline_declining) {
      alerts.push({
        id: "pipeline-decline",
        level: "warning",
        icon: TrendingDown,
        message: "Pipeline in calo rispetto al periodo precedente",
        link: "/azienda/marketing",
      });
    }
  }

  // Operations alerts
  if (operations.overduePayments > 0) {
    alerts.push({
      id: "overdue-payments",
      level: "critical",
      icon: CreditCard,
      message: `${operations.overduePayments} pagamenti scaduti (€${Math.round(operations.overdueAmount).toLocaleString("it-IT")})`,
      link: "/azienda/ordini",
    });
  }
  if (operations.lateOrders > 0) {
    alerts.push({
      id: "late-orders",
      level: "warning",
      icon: AlertTriangle,
      message: `${operations.lateOrders} ordini in ritardo`,
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
      link: "/azienda/costi",
    });
  }

  if (alerts.length === 0) return null;

  // Sort: critical first, then warning, then info
  const sortedAlerts = [...alerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.level] - order[b.level];
  });

  return (
    <div className="flex flex-wrap gap-2">
      {sortedAlerts.map(alert => {
        const Icon = alert.icon;
        const content = (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              alert.level === "critical" && "bg-destructive/10 text-destructive hover:bg-destructive/20",
              alert.level === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
              alert.level === "info" && "bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{alert.message}</span>
          </div>
        );

        return alert.link ? (
          <Link key={alert.id} to={alert.link}>{content}</Link>
        ) : (
          <div key={alert.id}>{content}</div>
        );
      })}
    </div>
  );
});
