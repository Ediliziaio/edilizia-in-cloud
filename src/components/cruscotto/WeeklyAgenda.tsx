import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ArrowUpRight, ArrowDownLeft, HardHat, CalendarCheck } from "lucide-react";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import type { WeeklyAgendaData } from "@/hooks/useCruscottoData";

interface Props {
  data: WeeklyAgendaData;
  isLoading: boolean;
}

const ITEMS = [
  {
    key: "incomingPayments" as const,
    label: "Incassi Previsti",
    icon: ArrowUpRight,
    color: "text-emerald-600 dark:text-emerald-400",
    format: (d: WeeklyAgendaData) => `${d.incomingPaymentsCount} (${fmtCur(d.incomingPayments)})`,
  },
  {
    key: "dueCosts" as const,
    label: "Costi in Scadenza",
    icon: ArrowDownLeft,
    color: "text-destructive",
    format: (d: WeeklyAgendaData) => `${d.dueCostsCount} (${fmtCur(d.dueCosts)})`,
  },
  {
    key: "deliveries" as const,
    label: "Consegne Previste",
    icon: HardHat,
    color: "text-amber-600 dark:text-amber-400",
    format: (d: WeeklyAgendaData) => `${d.deliveries}`,
  },
  {
    key: "appointments" as const,
    label: "Appuntamenti",
    icon: CalendarCheck,
    color: "text-blue-600 dark:text-blue-400",
    format: (d: WeeklyAgendaData) => `${d.appointments}`,
  },
];

export const WeeklyAgenda = memo(function WeeklyAgenda({ data, isLoading }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Prossimi 7 Giorni
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${item.color}`} />
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className="text-sm font-semibold tabular-nums truncate">{item.format(data)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
