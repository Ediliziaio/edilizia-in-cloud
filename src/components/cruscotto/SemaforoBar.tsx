/**
 * SemaforoBar — Barra orizzontale con 3 indicatori semaforo
 *
 * Cassa 🟢🟡🔴 | Lavoro 🟢🟡🔴 | Incassi 🟢🟡🔴
 *
 * L'imprenditore capisce in 1 secondo lo stato dell'azienda.
 */

import { Wallet, HardHat, TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

type SemaforoColor = "green" | "yellow" | "red";

interface SemaforoItem {
  label: string;
  color: SemaforoColor;
  value: string;
  detail: string;
  icon: React.ElementType;
}

interface SemaforoBarProps {
  cashFlowNet: number;
  thisMonthIncome: number;
  thisMonthOutflow: number;
  activeOrders: number;
  lateOrders: number;
  pendingRevenue: number;
  overdueAmount: number;
  overduePayments: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
}

function getCassaColor(cashFlowNet: number, thisMonthIncome: number, thisMonthOutflow: number): SemaforoColor {
  // Cash flow positivo e entrate > uscite → verde
  if (cashFlowNet > 0 && thisMonthIncome > thisMonthOutflow) return "green";
  // Cash flow negativo pesante o uscite doppie delle entrate → rosso
  if (cashFlowNet < 0 || (thisMonthOutflow > 0 && thisMonthIncome < thisMonthOutflow * 0.5)) return "red";
  // Via di mezzo → giallo
  return "yellow";
}

function getLavoroColor(activeOrders: number, lateOrders: number): SemaforoColor {
  if (activeOrders === 0) return "yellow"; // Nessun lavoro = attenzione
  const lateRatio = lateOrders / activeOrders;
  if (lateRatio === 0) return "green";
  if (lateRatio > 0.3) return "red"; // >30% in ritardo
  return "yellow";
}

function getIncassiColor(pendingRevenue: number, overdueAmount: number, overduePayments: number): SemaforoColor {
  if (overduePayments === 0 && overdueAmount === 0) return "green";
  if (pendingRevenue > 0 && overdueAmount / pendingRevenue > 0.3) return "red"; // >30% scaduto
  if (overduePayments > 3) return "red";
  return "yellow";
}

const colorMap = {
  green: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "text-emerald-600 dark:text-emerald-500",
    pulse: "animate-none",
  },
  yellow: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    label: "text-amber-600 dark:text-amber-500",
    pulse: "animate-pulse",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    label: "text-red-600 dark:text-red-500",
    pulse: "animate-pulse",
  },
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toFixed(0)} €`;
}

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  if (current > previous) return <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />;
  if (current < previous) return <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function SemaforoBar(props: SemaforoBarProps) {
  const items: SemaforoItem[] = [
    {
      label: "Cassa",
      color: getCassaColor(props.cashFlowNet, props.thisMonthIncome, props.thisMonthOutflow),
      value: fmt(props.cashFlowNet),
      detail: props.cashFlowNet >= 0 ? "Cash flow positivo" : "Cash flow negativo",
      icon: Wallet,
    },
    {
      label: "Lavoro",
      color: getLavoroColor(props.activeOrders, props.lateOrders),
      value: `${props.activeOrders} attivi`,
      detail: props.lateOrders === 0 ? "Tutto in tempo" : `${props.lateOrders} in ritardo`,
      icon: HardHat,
    },
    {
      label: "Incassi",
      color: getIncassiColor(props.pendingRevenue, props.overdueAmount, props.overduePayments),
      value: props.overduePayments > 0 ? fmt(props.overdueAmount) : "Tutto ok",
      detail: props.overduePayments > 0 ? `${props.overduePayments} rate scadute` : "Nessuno scaduto",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 print:grid-cols-3">
      {items.map((item) => {
        const c = colorMap[item.color];
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={`flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 rounded-xl border px-2 py-2 sm:px-4 sm:py-3 ${c.bg} ${c.border} transition-all`}
          >
            {/* Semaforo dot + icona mobile */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="relative flex-shrink-0">
                <div className={`h-3 w-3 sm:h-4 sm:w-4 rounded-full ${c.dot} ${c.pulse}`} />
                {item.color !== "green" && (
                  <div className={`absolute inset-0 h-3 w-3 sm:h-4 sm:w-4 rounded-full ${c.dot} opacity-30 animate-ping`} />
                )}
              </div>
              <div className={`hidden sm:flex h-8 w-8 items-center justify-center rounded-lg ${c.bg} flex-shrink-0`}>
                <Icon className={`h-4 w-4 ${c.text}`} />
              </div>
            </div>

            {/* Testo */}
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
