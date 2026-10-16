import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, AlertTriangle, HeadphonesIcon, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OperationsData, WeeklyAgendaData } from "@/hooks/useCruscottoData";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { Link } from "react-router-dom";
import { WeeklySnapshot } from "./WeeklySnapshot";

interface Props {
  operations: OperationsData;
  weeklyAgenda: WeeklyAgendaData;
  isLoading: boolean;
  dataError?: unknown;
}

export const OperationsDelivery = memo(function OperationsDelivery({ operations, weeklyAgenda, isLoading, dataError }: Props) {
  const items = [
    {
      label: "Commesse da completare",
      value: operations.activeOrders,
      icon: ClipboardList,
      link: "/azienda/ordini?anno=all&status=__da_completare__",
      alert: false,
    },
    {
      label: "Commesse in ritardo",
      value: operations.lateOrders,
      icon: AlertTriangle,
      link: "/azienda/ordini?anno=all&status=__da_completare__",
      alert: operations.lateOrders > 0,
    },
    {
      label: "Ticket Aperti",
      value: operations.openTickets,
      icon: HeadphonesIcon,
      link: "/azienda/assistenza",
      alert: operations.openTickets > 5,
    },
    {
      label: "Rate commesse scadute",
      value: operations.overduePayments,
      icon: CreditCard,
      link: "/azienda/ordini",
      alert: operations.overduePayments > 0,
    },
  ];

  if (dataError) return <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">Situazione commesse non disponibile. Riprova dal messaggio in alto.</p>;
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">Situazione commesse · tutti gli anni</h3>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.link}>
              <Card className={cn(
                "p-3 hover:shadow-md transition-shadow cursor-pointer",
                item.alert && "border-destructive/50 bg-destructive/5"
              )}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("h-4 w-4", item.alert ? "text-destructive" : "text-muted-foreground")} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                {isLoading ? <Skeleton className="h-6 w-12" /> : (
                  <div className={cn(
                    "text-2xl font-bold tabular-nums",
                    item.alert && "text-destructive"
                  )}>
                    {item.value}
                  </div>
                )}
                {item.label === "Rate commesse scadute" && !isLoading && <p className="mt-0.5 text-sm font-semibold tabular-nums text-destructive">{fmtCur(operations.overdueAmount)}</p>}
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Weekly Snapshot */}
      <WeeklySnapshot data={weeklyAgenda} isLoading={isLoading} />
    </div>
  );
});
