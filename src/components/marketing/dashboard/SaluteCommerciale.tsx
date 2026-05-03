/**
 * SaluteCommerciale — Gauge di salute per Dashboard Marketing
 *
 * Score basato su: lead response, show rate, close rate, pipeline, revenue
 */

import { cn } from "@/lib/utils";

interface Props {
  leadsNew: number;
  staleLeads: number;
  showRate: number;
  closeRate: number;
  pipelineValue: number;
  pipelineDeclining: boolean;
  revenue: number;
  contractsWon: number;
  appointmentsDone: number;
  appointmentsSet: number;
  isLoading?: boolean;
}

function calcScore(p: Props): number {
  let score = 0;

  // 1. Lead response (25 pts) — meno stale lead = meglio
  if (p.leadsNew === 0 && p.staleLeads === 0) {
    score += 12; // Nessun lead = neutro
  } else if (p.staleLeads === 0) {
    score += 25; // Tutti contattati
  } else {
    const responseRate = p.leadsNew > 0 ? 1 - (p.staleLeads / p.leadsNew) : 0;
    score += Math.max(0, Math.round(25 * responseRate));
  }

  // 2. Show rate (25 pts) — target 70%+
  if (p.appointmentsSet === 0) {
    score += 12; // Neutro
  } else {
    score += Math.min(25, Math.round(25 * (p.showRate / 80)));
  }

  // 3. Close rate (25 pts) — target 20%+
  if (p.leadsNew === 0) {
    score += 12;
  } else {
    score += Math.min(25, Math.round(25 * (p.closeRate / 25)));
  }

  // 4. Pipeline health (25 pts)
  if (p.pipelineValue === 0) {
    score += 5;
  } else if (p.pipelineDeclining) {
    score += 12;
  } else {
    score += 25;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function getScoreConfig(score: number) {
  if (score >= 80) return {
    color: "text-emerald-600 dark:text-emerald-400",
    ringColor: "stroke-emerald-500",
    trackColor: "stroke-emerald-100 dark:stroke-emerald-900",
    label: "Performance top",
    message: "Marketing e vendite girano a pieno regime. Continua così!",
  };
  if (score >= 60) return {
    color: "text-blue-600 dark:text-blue-400",
    ringColor: "stroke-blue-500",
    trackColor: "stroke-blue-100 dark:stroke-blue-900",
    label: "Buona performance",
    message: "I numeri sono positivi, alcune metriche possono migliorare.",
  };
  if (score >= 40) return {
    color: "text-amber-600 dark:text-amber-400",
    ringColor: "stroke-amber-500",
    trackColor: "stroke-amber-100 dark:stroke-amber-900",
    label: "Da migliorare",
    message: "Show rate o close rate sotto target. Controlla le azioni.",
  };
  return {
    color: "text-red-600 dark:text-red-400",
    ringColor: "stroke-red-500",
    trackColor: "stroke-red-100 dark:stroke-red-900",
    label: "Critico",
    message: "Le conversioni sono troppo basse. Serve un intervento immediato.",
  };
}

export function SaluteCommerciale(props: Props) {
  if (props.isLoading) {
    return (
      <div className="flex items-center justify-center gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-[136px] w-[136px] rounded-full bg-muted animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="h-5 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const score = calcScore(props);
  const config = getScoreConfig(score);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm sm:p-5">
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
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Salute commerciale</p>
            <h3 className={cn("text-lg font-bold", config.color)}>{config.label}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{config.message}</p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <ScorePill label="Lead" value={props.staleLeads === 0 ? "ok" : `${props.staleLeads} fermi`} />
            <ScorePill label="Show" value={props.showRate >= 70 ? "ok" : `${props.showRate.toFixed(0)}%`} />
            <ScorePill label="Close" value={props.closeRate >= 15 ? "ok" : `${props.closeRate.toFixed(0)}%`} />
            <ScorePill label="Pipeline" value={!props.pipelineDeclining ? "ok" : "in calo"} />
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
