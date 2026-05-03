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
    bg: "bg-gradient-to-br from-white to-emerald-50/80 dark:from-slate-950 dark:to-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
    iconBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "text-emerald-600 dark:text-emerald-500",
  },
  yellow: {
    bg: "bg-gradient-to-br from-white to-amber-50/90 dark:from-slate-950 dark:to-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-400",
    label: "text-amber-600 dark:text-amber-500",
  },
  red: {
    bg: "bg-gradient-to-br from-white to-red-50/90 dark:from-slate-950 dark:to-red-950/30",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    iconBg: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((item) => {
        const c = colorMap[item.color];
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={`group rounded-2xl border px-4 py-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${c.bg} ${c.border}`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.iconBg}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${c.label}`}>{item.label}</p>
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dot} ${item.color === "red" ? "animate-pulse" : ""}`} />
                </div>
                <p className={`mt-2 truncate text-xl font-bold ${c.text}`}>{item.value}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">{item.detail}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
