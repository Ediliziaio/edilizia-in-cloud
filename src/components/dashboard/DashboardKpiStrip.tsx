import React from "react";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, TrendingDown, Minus, Euro, ClipboardList, Wallet, HeadphonesIcon } from "lucide-react";
import { Link } from "react-router-dom";

interface KpiItem {
  label: string;
  value: string | number;
  delta?: number | null;
  icon: React.ElementType;
  color?: "default" | "success" | "warning" | "danger";
  link?: string;
}

function calcDelta(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function DeltaBadge({ delta }: { delta?: number | null }) {
  if (delta === null || delta === undefined) return null;

  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  const Icon = isPositive ? TrendingUp : isNeutral ? Minus : TrendingDown;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : isNeutral
          ? "text-muted-foreground"
          : "text-destructive"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

interface DashboardKpiStripProps {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  ordersThisMonth: number;
  ordersPrevMonth: number;
  netCashFlow: number;
  openTickets: number;
}

const DashboardKpiStrip = React.memo(function DashboardKpiStrip({
  revenueThisMonth,
  revenuePrevMonth,
  ordersThisMonth,
  ordersPrevMonth,
  netCashFlow,
  openTickets,
}: DashboardKpiStripProps) {
  const kpis: KpiItem[] = [
    {
      label: "Fatturato Mese",
      value: formatCurrency(revenueThisMonth),
      delta: calcDelta(revenueThisMonth, revenuePrevMonth),
      icon: Euro,
      link: "/azienda/previsionale",
    },
    {
      label: "Ordini Attivi",
      value: ordersThisMonth,
      delta: calcDelta(ordersThisMonth, ordersPrevMonth),
      icon: ClipboardList,
      link: "/azienda/ordini",
    },
    {
      label: "Saldo Cassa",
      value: formatCurrency(netCashFlow),
      icon: Wallet,
      color: netCashFlow >= 0 ? "success" : "danger",
      link: "/azienda/previsionale",
    },
    {
      label: "Ticket Aperti",
      value: openTickets,
      icon: HeadphonesIcon,
      color: openTickets === 0 ? "success" : "warning",
      link: "/azienda/ticket",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const valueColor =
          kpi.color === "success"
            ? "text-emerald-600 dark:text-emerald-400"
            : kpi.color === "danger"
            ? "text-destructive"
            : kpi.color === "warning"
            ? "text-orange-600 dark:text-orange-400"
            : "text-foreground";

        const content = (
          <div className="bg-secondary rounded-lg p-3 sm:p-4 transition-colors hover:bg-secondary/80">
            <div className="flex items-start justify-between gap-1">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                  {kpi.label}
                </p>
                <p className={`text-lg sm:text-xl font-semibold tabular-nums truncate ${valueColor}`}>
                  {kpi.value}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <kpi.icon className="h-4 w-4 text-muted-foreground/60" />
                <DeltaBadge delta={kpi.delta} />
              </div>
            </div>
          </div>
        );

        return kpi.link ? (
          <Link key={kpi.label} to={kpi.link}>
            {content}
          </Link>
        ) : (
          <div key={kpi.label}>{content}</div>
        );
      })}
    </div>
  );
});

export { DashboardKpiStrip };
