/**
 * SaluteAziendale — Gauge grande con score 0-100 e frase umana
 *
 * Calcola un punteggio basato su:
 * - Margine di profitto (25 pts)
 * - Cash flow (25 pts)
 * - Ordini e ritardi (25 pts)
 * - Incassi e scaduti (25 pts)
 */

import { cn } from "@/lib/utils";

interface SaluteAziendaleProps {
  revenueThisMonth: number;
  revenuePrevMonth: number;
  marginThisMonth: number;
  cashFlowNet: number;
  thisMonthIncome: number;
  thisMonthOutflow: number;
  activeOrders: number;
  lateOrders: number;
  overduePayments: number;
  overdueAmount: number;
  pendingRevenue: number;
  supplierDebt: number;
  isLoading?: boolean;
}

function calcScore(p: SaluteAziendaleProps): number {
  let score = 0;

  // 1. Margine e fatturato (25 pts)
  if (p.revenueThisMonth > 0) {
    // Fatturato in crescita rispetto al mese precedente
    if (p.revenuePrevMonth > 0) {
      const growth = (p.revenueThisMonth - p.revenuePrevMonth) / p.revenuePrevMonth;
      score += Math.min(15, Math.max(0, 15 * (1 + growth))); // 0-15 basato su crescita
    } else {
      score += 10; // Ha fatturato ma non c'è confronto
    }
    // Margine positivo
    if (p.marginThisMonth > 0.15) score += 10;
    else if (p.marginThisMonth > 0.05) score += 6;
    else if (p.marginThisMonth > 0) score += 3;
  }

  // 2. Cash flow (25 pts)
  if (p.cashFlowNet > 0) {
    score += 15;
    if (p.thisMonthIncome > p.thisMonthOutflow * 1.2) score += 10; // Entrate 20% > uscite
    else score += 5;
  } else if (p.cashFlowNet === 0 && p.thisMonthIncome === 0 && p.thisMonthOutflow === 0) {
    score += 12; // Nessun dato, neutro
  } else {
    // Cash flow negativo
    const ratio = p.thisMonthOutflow > 0 ? p.thisMonthIncome / p.thisMonthOutflow : 0;
    score += Math.max(0, Math.round(15 * ratio));
  }

  // 3. Ordini e ritardi (25 pts)
  if (p.activeOrders === 0) {
    score += 12; // Nessun ordine = neutro
  } else {
    const onTimeRatio = 1 - (p.lateOrders / p.activeOrders);
    score += Math.round(25 * onTimeRatio);
  }

  // 4. Incassi e scaduti (25 pts)
  if (p.overduePayments === 0) {
    score += 25;
  } else if (p.pendingRevenue > 0) {
    const healthyRatio = 1 - (p.overdueAmount / p.pendingRevenue);
    score += Math.max(0, Math.round(25 * healthyRatio));
  } else {
    score += 5;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function getScoreConfig(score: number) {
  if (score >= 80) return {
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "from-emerald-500 to-emerald-600",
    ringColor: "stroke-emerald-500",
    trackColor: "stroke-emerald-100 dark:stroke-emerald-900",
    label: "Eccellente",
    message: "L'azienda è in ottima salute. Continua così!",
    emoji: "💪",
  };
  if (score >= 60) return {
    color: "text-blue-600 dark:text-blue-400",
    bg: "from-blue-500 to-blue-600",
    ringColor: "stroke-blue-500",
    trackColor: "stroke-blue-100 dark:stroke-blue-900",
    label: "Buono",
    message: "Situazione sotto controllo, alcune aree da migliorare.",
    emoji: "👍",
  };
  if (score >= 40) return {
    color: "text-amber-600 dark:text-amber-400",
    bg: "from-amber-500 to-amber-600",
    ringColor: "stroke-amber-500",
    trackColor: "stroke-amber-100 dark:stroke-amber-900",
    label: "Attenzione",
    message: "Ci sono aspetti che richiedono intervento. Controlla le azioni urgenti.",
    emoji: "⚠️",
  };
  return {
    color: "text-red-600 dark:text-red-400",
    bg: "from-red-500 to-red-600",
    ringColor: "stroke-red-500",
    trackColor: "stroke-red-100 dark:stroke-red-900",
    label: "Critico",
    message: "Serve intervento immediato su cassa, ritardi o scaduti.",
    emoji: "🚨",
  };
}

function ScoreGauge({ score, config }: { score: number; config: ReturnType<typeof getScoreConfig> }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="136" height="136" className="-rotate-90">
        {/* Track */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          className={config.trackColor}
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Progress */}
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          className={config.ringColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-bold tabular-nums", config.color)}>{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">/100</span>
      </div>
    </div>
  );
}

export function SaluteAziendale(props: SaluteAziendaleProps) {
  if (props.isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5 flex items-center justify-center gap-6">
        <div className="h-[136px] w-[136px] rounded-full bg-muted animate-pulse" />
        <div className="space-y-2">
          <div className="h-5 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const score = calcScore(props);
  const config = getScoreConfig(score);

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-5">
      <div className="flex items-center gap-3 sm:gap-6 flex-wrap sm:flex-nowrap">
        {/* Gauge */}
        <div className="mx-auto sm:mx-0">
          <ScoreGauge score={score} config={config} />
        </div>

        {/* Label + message */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{config.emoji}</span>
            <h3 className={cn("text-lg font-bold", config.color)}>{config.label}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{config.message}</p>

          {/* Breakdown mini pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <ScorePill label="Margine" value={props.marginThisMonth > 0.1 ? "ok" : props.marginThisMonth > 0 ? "basso" : "—"} />
            <ScorePill label="Cash" value={props.cashFlowNet >= 0 ? "ok" : "negativo"} />
            <ScorePill label="Ritardi" value={props.lateOrders === 0 ? "ok" : `${props.lateOrders}`} />
            <ScorePill label="Scaduti" value={props.overduePayments === 0 ? "ok" : `${props.overduePayments}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: string }) {
  const isOk = value === "ok" || value === "—";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
      isOk
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
        : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", isOk ? "bg-emerald-500" : "bg-red-500")} />
      {label}: {value}
    </span>
  );
}
