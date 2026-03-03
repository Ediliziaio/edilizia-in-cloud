import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Euro, Truck, Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Deadline {
  id: string;
  type: "receivable" | "supplier" | "work";
  label: string;
  sublabel: string;
  amount?: number;
  daysLeft: number;
}

interface WeeklyDeadlinesProps {
  receivables: Array<{
    orderDescription: string;
    customerName: string;
    amount: number;
    expectedDate: string;
    daysLeft: number;
  }>;
  supplierPayments: Array<{
    name: string;
    amount: number;
    dueDate: string;
    daysLeft: number;
  }>;
  upcomingWorks: Array<{
    orderCode: string | null;
    customerName: string;
    workDate: string;
    daysLeft: number;
  }>;
}

function DaysLeftBadge({ days }: { days: number }) {
  const variant = days <= 1 ? "destructive" : days <= 3 ? "secondary" : "outline";
  const label = days === 0 ? "Oggi" : days === 1 ? "Domani" : `${days}g`;
  return (
    <Badge variant={variant} className="text-xs shrink-0">
      {label}
    </Badge>
  );
}

const iconMap = {
  receivable: Euro,
  supplier: Truck,
  work: Wrench,
};

const WeeklyDeadlines = React.memo(function WeeklyDeadlines({
  receivables,
  supplierPayments,
  upcomingWorks,
}: WeeklyDeadlinesProps) {
  const deadlines: Deadline[] = [
    ...receivables.map((r, i) => ({
      id: `recv-${i}`,
      type: "receivable" as const,
      label: `Incasso: ${r.customerName}`,
      sublabel: r.orderDescription,
      amount: r.amount,
      daysLeft: r.daysLeft,
    })),
    ...supplierPayments.map((s, i) => ({
      id: `supp-${i}`,
      type: "supplier" as const,
      label: `Pagamento: ${s.name}`,
      sublabel: formatCurrency(s.amount),
      amount: s.amount,
      daysLeft: s.daysLeft,
    })),
    ...upcomingWorks.map((w, i) => ({
      id: `work-${i}`,
      type: "work" as const,
      label: w.orderCode ? `#${w.orderCode}` : "Lavoro",
      sublabel: w.customerName,
      daysLeft: w.daysLeft,
    })),
  ].sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Scadenze Settimana
            </CardTitle>
            <CardDescription>Prossimi 7 giorni</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nessuna scadenza imminente</p>
            <p className="text-xs mt-1">Tutto sotto controllo per i prossimi 7 giorni</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {deadlines.map((d) => {
              const Icon = iconMap[d.type];
              return (
                <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.sublabel}</p>
                  </div>
                  {d.amount !== undefined && d.type === "receivable" && (
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                      {formatCurrency(d.amount)}
                    </span>
                  )}
                  <DaysLeftBadge days={d.daysLeft} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export { WeeklyDeadlines };
