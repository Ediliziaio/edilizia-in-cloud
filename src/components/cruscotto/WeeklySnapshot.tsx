import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownCircle, ArrowUpCircle, Truck, CalendarCheck } from "lucide-react";
import { fmtCur, fmt } from "@/components/marketing/dashboard/utils";
import type { WeeklyAgendaData } from "@/hooks/useCruscottoData";

interface Props {
  data: WeeklyAgendaData;
  isLoading: boolean;
}

const items = [
  {
    label: "Incassi Attesi",
    icon: ArrowDownCircle,
    getValue: (d: WeeklyAgendaData) => fmtCur(d.incomingPayments),
    getSub: (d: WeeklyAgendaData) => `${d.incomingPaymentsCount} pagamenti`,
    color: "text-emerald-600 dark:text-emerald-400",
    iconColor: "text-emerald-500",
  },
  {
    label: "Costi in Scadenza",
    icon: ArrowUpCircle,
    getValue: (d: WeeklyAgendaData) => fmtCur(d.dueCosts),
    getSub: (d: WeeklyAgendaData) => `${d.dueCostsCount} voci`,
    color: "text-destructive",
    iconColor: "text-destructive",
  },
  {
    label: "Consegne",
    icon: Truck,
    getValue: (d: WeeklyAgendaData) => fmt(d.deliveries),
    getSub: () => "ordini previsti",
    color: "text-foreground",
    iconColor: "text-muted-foreground",
  },
  {
    label: "Appuntamenti",
    icon: CalendarCheck,
    getValue: (d: WeeklyAgendaData) => fmt(d.appointments),
    getSub: () => "in agenda",
    color: "text-foreground",
    iconColor: "text-muted-foreground",
  },
];

export const WeeklySnapshot = memo(function WeeklySnapshot({ data, isLoading }: Props) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Prossimi 7 Giorni
      </h4>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-3.5 w-3.5 ${item.iconColor}`} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <>
                  <div className={`text-base font-bold tabular-nums ${item.color}`}>
                    {item.getValue(data)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {item.getSub(data)}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
});
