/**
 * SemaforoMarketing — Barra semaforo per Dashboard Marketing & Vendite
 *
 * Lead 🟢🟡🔴 | Pipeline 🟢🟡🔴 | Conversioni 🟢🟡🔴
 */

import { UserPlus, Target, TrendingUp } from "lucide-react";

type SemaforoColor = "green" | "yellow" | "red";

interface SemaforoItem {
  label: string;
  color: SemaforoColor;
  value: string;
  detail: string;
  icon: React.ElementType;
}

interface Props {
  leadsTotal: number;
  leadsNew: number;
  staleLeads: number;
  pipelineValue: number;
  pipelineDeclining: boolean;
  showRate: number;
  closeRate: number;
  contractsWon: number;
}

function getLeadColor(leadsNew: number, staleLeads: number): SemaforoColor {
  if (leadsNew === 0 && staleLeads === 0) return "yellow";
  if (staleLeads > 5) return "red";
  if (staleLeads > 0) return "yellow";
  return "green";
}

function getPipelineColor(pipelineValue: number, pipelineDeclining: boolean): SemaforoColor {
  if (pipelineValue === 0) return "red";
  if (pipelineDeclining) return "yellow";
  return "green";
}

function getConversioniColor(showRate: number, closeRate: number): SemaforoColor {
  if (showRate >= 70 && closeRate >= 15) return "green";
  if (showRate < 50 || closeRate < 5) return "red";
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

export function SemaforoMarketing(props: Props) {
  const items: SemaforoItem[] = [
    {
      label: "Lead",
      color: getLeadColor(props.leadsNew, props.staleLeads),
      value: `${props.leadsNew} nuovi`,
      detail: props.staleLeads > 0 ? `${props.staleLeads} da contattare` : `${props.leadsTotal} totali nel periodo`,
      icon: UserPlus,
    },
    {
      label: "Pipeline",
      color: getPipelineColor(props.pipelineValue, props.pipelineDeclining),
      value: fmt(props.pipelineValue),
      detail: props.pipelineDeclining ? "In calo vs periodo precedente" : "Stabile o in crescita",
      icon: Target,
    },
    {
      label: "Conversioni",
      color: getConversioniColor(props.showRate, props.closeRate),
      value: `${props.contractsWon} vinti`,
      detail: `Show ${props.showRate.toFixed(0)}% · Close ${props.closeRate.toFixed(0)}%`,
      icon: TrendingUp,
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
