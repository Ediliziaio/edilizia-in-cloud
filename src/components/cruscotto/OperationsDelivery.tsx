import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, AlertTriangle, HeadphonesIcon, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OperationsData } from "@/hooks/useCruscottoData";
import { Link } from "react-router-dom";

interface Props {
  operations: OperationsData;
  isLoading: boolean;
}

export const OperationsDelivery = memo(function OperationsDelivery({ operations, isLoading }: Props) {
  const items = [
    {
      label: "Ordini Attivi",
      value: operations.activeOrders,
      icon: ClipboardList,
      link: "/azienda/ordini",
      alert: false,
    },
    {
      label: "Ordini in Ritardo",
      value: operations.lateOrders,
      icon: AlertTriangle,
      link: "/azienda/ordini",
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
      label: "Pagamenti Scaduti",
      value: operations.overduePayments,
      icon: CreditCard,
      link: "/azienda/ordini",
      alert: operations.overduePayments > 0,
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Operations & Delivery</h3>

      <div className="grid grid-cols-2 gap-3">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.link}>
              <Card className={cn(
                "p-4 hover:shadow-md transition-shadow cursor-pointer",
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
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
});
