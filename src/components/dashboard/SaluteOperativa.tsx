/**
 * SaluteOperativa — Gauge di salute per Dashboard Gestione
 *
 * Score basato su: ordini, ticket, cash flow, magazzino, scadenze
 */

import { cn } from "@/lib/utils";

interface Props {
  totalOrders: number;
  openTickets: number;
  netCashFlow: number;
  urgentItemsCount: number;
  financialAlertsCount: number;
  upcomingWorks: number;
}

function calcScore(p: Props): number {
  let score = 0;

  // 1. Ordini attivi (25 pts) — avere ordini è positivo
  if (p.totalOrders > 0) score += 25;
  else score += 10;

  // 2. Ticket aperti (25 pts) — meno ticket = meglio
  if (p.openTickets === 0) score += 25;
  else if (p.openTickets <= 2) score += 15;
  else if (p.openTickets <= 5) score += 8;
  else score += 0;

  // 3. Cash flow (25 pts)
  if (p.netCashFlow > 0) score += 25;
  else if (p.netCashFlow === 0) score += 12;
  else score += Math.max(0, 10);

  // 4. Urgenze magazzino + alert finanziari (25 pts)
  const issues = p.urgentItemsCount + p.financialAlertsCount;
  if (issues === 0) score += 25;
  else if (issues <= 2) score += 15;
  else if (issues <= 5) score += 8;
  else score += 0;

  return Math.min(100, Math.max(0, Math.round(score)));
}

function getScoreConfig(score: number) {
  if (score >= 80) return {
    color: "text-emerald-600 dark:text-emerald-400",
    ringColor: "stroke-emerald-500",
    trackColor: "stroke-emerald-100 dark:stroke-emerald-900",
    label: "Operazioni OK",
    message: "Tutti i reparti funzionano bene. Nessun intervento urgente.",
    emoji: "💪",
  };
  if (score >= 60) return {
    color: "text-blue-600 dark:text-blue-400",
    ringColor: "stroke-blue-500",
    trackColor: "stroke-blue-100 dark:stroke-blue-900",
    label: "Sotto controllo",
    message: "Situazione gestibile, alcune aree richiedono attenzione.",
    emoji: "👍",
  };
  if (score >= 40) return {
    color: "text-amber-600 dark:text-amber-400",
    ringColor: "stroke-amber-500",
    trackColor: "stroke-amber-100 dark:stroke-amber-900",
    label: "Attenzione",
    message: "Ci sono criticità operative da risolvere. Controlla le azioni.",
    emoji: "⚠️",
  };
  return {
    color: "text-red-600 dark:text-red-400",
    ringColor: "stroke-red-500",
    trackColor: "stroke-red-100 dark:stroke-red-900",
    label: "Critico",
    message: "Servono interventi immediati su ordini, ticket o magazzino.",
    emoji: "🚨",
  };
}

export function SaluteOperativa(props: Props) {
  const score = calcScore(props);
  const config = getScoreConfig(score);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-5">
      <div className="flex items-center gap-3 sm:gap-6 flex-wrap sm:flex-nowrap">
        {/* Gauge */}
        <div className="relative inline-flex items-center justify-center flex-shrink-0">
          <svg width="136" height="136" className="-rotate-90">
            <circle cx="68" cy="68" r={radius} fill="none" className={config.trackColor} strokeWidth="10" strokeLinecap="round" />
            <circle cx="68" cy="68" r={radius} fill="none" className={config.ringColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 1s ease-out" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-3xl font-bold tabular-nums", config.color)}>{score}</span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">/100</span>
          </div>
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{config.emoji}</span>
            <h3 className={cn("text-lg font-bold", config.color)}>{config.label}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{config.message}</p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <ScorePill label="Ticket" value={props.openTickets === 0 ? "ok" : `${props.openTickets}`} />
            <ScorePill label="Cash" value={props.netCashFlow >= 0 ? "ok" : "negativo"} />
            <ScorePill label="Magazzino" value={props.urgentItemsCount === 0 ? "ok" : `${props.urgentItemsCount}`} />
            <ScorePill label="Alert" value={props.financialAlertsCount === 0 ? "ok" : `${props.financialAlertsCount}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: string }) {
  const isOk = value === "ok";
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
