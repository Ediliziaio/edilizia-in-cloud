import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, CreditCard, Users, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import type { OperationsData, FinanceData } from "@/hooks/useCruscottoData";
import type { AlertsData } from "@/hooks/useMarketingDashboard";

interface Props {
  operations: OperationsData;
  finance: FinanceData;
  marketingAlerts: AlertsData | undefined;
  isLoading: boolean;
}

interface Priority {
  id: string;
  icon: React.ElementType;
  text: string;
  link: string;
  urgency: "high" | "medium";
}

export const DailyPriorities = memo(function DailyPriorities({ operations, finance, marketingAlerts, isLoading }: Props) {
  const priorities = useMemo(() => {
    const items: Priority[] = [];

    if (operations.overduePayments > 0) {
      items.push({
        id: "overdue",
        icon: CreditCard,
        text: `Sollecita ${operations.overduePayments} pagamenti scaduti (${fmtCur(operations.overdueAmount)})`,
        link: "/azienda/ordini",
        urgency: "high",
      });
    }

    if (marketingAlerts && marketingAlerts.stale_leads > 0) {
      items.push({
        id: "stale-leads",
        icon: Users,
        text: `Contatta ${marketingAlerts.stale_leads} lead non seguiti da 48h`,
        link: "/azienda/marketing/contatti",
        urgency: "high",
      });
    }

    if (operations.lateOrders > 0) {
      items.push({
        id: "late-orders",
        icon: AlertTriangle,
        text: `Verifica ${operations.lateOrders} ordini in ritardo`,
        link: "/azienda/ordini",
        urgency: "medium",
      });
    }

    if (finance.cashFlowNet < 0) {
      items.push({
        id: "cashflow",
        icon: CreditCard,
        text: `Cash flow negativo: accelera incassi o rinvia uscite`,
        link: "/azienda/costi",
        urgency: "high",
      });
    }

    if (marketingAlerts && (marketingAlerts as any).stale_leads_2h > 0) {
      items.push({
        id: "warm-leads",
        icon: Clock,
        text: `${(marketingAlerts as any).stale_leads_2h} lead freschi da contattare subito`,
        link: "/azienda/marketing/contatti",
        urgency: "medium",
      });
    }

    return items.slice(0, 5);
  }, [operations, finance, marketingAlerts]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Priorità del Giorno</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (priorities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Priorità del Giorno
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">✅ Nessuna urgenza — tutto sotto controllo!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Priorità del Giorno
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {priorities.map((p, i) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.id}
                to={p.link}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted",
                  p.urgency === "high" && "text-destructive font-medium",
                  p.urgency === "medium" && "text-foreground",
                )}
              >
                <span className="text-xs text-muted-foreground font-bold w-4">{i + 1}.</span>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{p.text}</span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
