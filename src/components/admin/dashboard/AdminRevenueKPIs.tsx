import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Target, RefreshCw, Heart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  mrr: number;
  arr: number;
  nrr: number;
  avgLtv: number;
  previousMrr?: number;
}

function MiniDelta({ current, previous, suffix = "" }: { current: number; previous?: number; suffix?: string }) {
  if (!previous || previous === 0) return null;
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);
  const isUp = delta >= 0;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
        isUp ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      }`}
    >
      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}%{suffix}
    </span>
  );
}

export function AdminRevenueKPIs({ mrr, arr, nrr, avgLtv, previousMrr }: Props) {
  const kpis = [
    {
      title: "MRR",
      value: formatCurrency(mrr),
      description: "Monthly Recurring Revenue",
      icon: TrendingUp,
      iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      border: "border-l-emerald-500/50",
      delta: previousMrr ? <MiniDelta current={mrr} previous={previousMrr} suffix=" vs mese prec." /> : null,
    },
    {
      title: "ARR",
      value: formatCurrency(arr),
      description: "Annual Recurring Revenue",
      icon: Target,
      iconBg: "bg-primary/10 text-primary",
      border: "border-l-primary/50",
      delta: null,
    },
    {
      title: "NRR",
      value: `${nrr}%`,
      description: "Net Revenue Retention (6m)",
      icon: RefreshCw,
      iconBg: nrr >= 100
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      border: nrr >= 100 ? "border-l-emerald-500/50" : "border-l-amber-500/50",
      delta: nrr >= 100 ? (
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Eccellente</span>
      ) : nrr >= 90 ? (
        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Attenzione</span>
      ) : (
        <span className="text-[11px] font-medium text-destructive">Critico</span>
      ),
    },
    {
      title: "LTV Medio",
      value: formatCurrency(avgLtv),
      description: "Lifetime Value stimato",
      icon: Heart,
      iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      border: "border-l-violet-500/50",
      delta: null,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title} className={`border-l-[3px] ${kpi.border} overflow-hidden`}>
          <CardContent className="pt-4 pb-3.5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {kpi.title}
              </p>
              <div className={`p-2 rounded-lg ${kpi.iconBg}`}>
                <kpi.icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-muted-foreground">{kpi.description}</p>
              {kpi.delta}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
