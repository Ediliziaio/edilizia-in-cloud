/**
 * SemaforoOperazioni — Barra semaforo per Dashboard Gestione
 *
 * Ordini 🟢🟡🔴 | Cassa 🟢🟡🔴 | Scadenze 🟢🟡🔴
 */

import { ClipboardList, Wallet, CalendarClock } from "lucide-react";

type SemaforoColor = "green" | "yellow" | "red";

interface SemaforoItem {
  label: string;
  color: SemaforoColor;
  value: string;
  detail: string;
  icon: React.ElementType;
}

interface Props {
  totalOrders: number;
  openTickets: number;
  netCashFlow: number;
  upcomingWorks: number;
  urgentItemsCount: number;
  financialAlertsCount: number;
}

function getOrdiniColor(totalOrders: number, openTickets: number): SemaforoColor {
  if (totalOrders === 0) return "yellow";
  if (openTickets === 0) return "green";
  if (openTickets > 3) return "red";
  return "yellow";
}

function getCassaColor(netCashFlow: number): SemaforoColor {
  if (netCashFlow > 0) return "green";
  if (netCashFlow === 0) return "yellow";
  return "red";
}

function getScadenzeColor(upcomingWorks: number, urgentItemsCount: number, financialAlertsCount: number): SemaforoColor {
  const issues = urgentItemsCount + financialAlertsCount;
  if (issues === 0) return "green";
  if (issues > 3) return "red";
  return "yellow";
}

const colorMap = {
  green: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "text-emerald-600 dark:text-emerald-500",
  },
  yellow: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    label: "text-amber-600 dark:text-amber-500",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    label: "text-red-600 dark:text-red-500",
  },
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toFixed(0)} €`;
}

export function SemaforoOperazioni(props: Props) {
  const items: SemaforoItem[] = [
    {
      label: "Ordini",
      color: getOrdiniColor(props.totalOrders, props.openTickets),
      value: `${props.totalOrders} totali`,
      detail: props.openTickets === 0 ? "Nessun ticket aperto" : `${props.openTickets} ticket aperti`,
      icon: ClipboardList,
    },
    {
      label: "Cassa",
      color: getCassaColor(props.netCashFlow),
      value: fmt(props.netCashFlow),
      detail: props.netCashFlow >= 0 ? "Saldo netto positivo" : "Saldo netto negativo",
      icon: Wallet,
    },
    {
      label: "Scadenze",
      color: getScadenzeColor(props.upcomingWorks, props.urgentItemsCount, props.financialAlertsCount),
      value: `${props.upcomingWorks} lavori`,
      detail: props.urgentItemsCount > 0 ? `${props.urgentItemsCount} urgenze magazzino` : "Tutto sotto controllo",
      icon: CalendarClock,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((item) => {
        const c = colorMap[item.color];
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={`flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 rounded-xl border px-2 py-2 sm:px-4 sm:py-3 ${c.bg} ${c.border} transition-all`}
          >
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="relative flex-shrink-0">
                <div className={`h-3 w-3 sm:h-4 sm:w-4 rounded-full ${c.dot} ${item.color !== "green" ? "animate-pulse" : ""}`} />
                {item.color !== "green" && (
                  <div className={`absolute inset-0 h-3 w-3 sm:h-4 sm:w-4 rounded-full ${c.dot} opacity-30 animate-ping`} />
                )}
              </div>
              <div className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-lg ${c.bg} flex-shrink-0`}>
                <Icon className={`h-4 w-4 ${c.text}`} />
              </div>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className={`text-[10px] sm:text-xs font-medium uppercase tracking-wide ${c.label}`}>{item.label}</p>
              <p className={`text-xs sm:text-sm font-semibold ${c.text} truncate`}>{item.value}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate hidden sm:block">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
