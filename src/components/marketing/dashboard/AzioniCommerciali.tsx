/**
 * AzioniCommerciali — "Da fare oggi" per Dashboard Marketing & Vendite
 *
 * Priorità: lead freddi > show rate basso > pipeline in calo > appuntamenti pendenti
 */

import { useNavigate } from "react-router-dom";
import {
  UserX, TrendingDown, Calendar, Target,
  PhoneOff, CheckCircle2, ChevronRight, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UrgentAction {
  id: string;
  icon: React.ElementType;
  label: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  route?: string;
}

interface Props {
  staleLeads: number;
  staleLeads2h: number;
  showRate: number;
  showRateBelowThreshold: boolean;
  pipelineDeclining: boolean;
  pipelineValue: number;
  pendingAppointments: number;
  staleOpportunities: number;
  contractsWon: number;
  contractsLost: number;
  closeRate: number;
}

function buildActions(p: Props): UrgentAction[] {
  const actions: UrgentAction[] = [];

  // 1. Lead urgenti (< 2h)
  if (p.staleLeads2h > 0) {
    actions.push({
      id: "lead-2h",
      icon: UserX,
      label: `${p.staleLeads2h} lead da richiamare subito`,
      detail: "Non contattati da oltre 2 ore — ogni minuto conta",
      severity: "critical",
      route: "/azienda/contatti-crm",
    });
  }

  // 2. Lead freddi (48h+)
  if (p.staleLeads > 0) {
    actions.push({
      id: "lead-freddi",
      icon: UserX,
      label: `${p.staleLeads} lead non contattati da 48h+`,
      detail: "Rischio di perderli — assegna un follow-up immediato",
      severity: "critical",
      route: "/azienda/contatti-crm",
    });
  }

  // 3. Show rate basso
  if (p.showRateBelowThreshold) {
    actions.push({
      id: "show-rate",
      icon: PhoneOff,
      label: `Show rate al ${p.showRate.toFixed(0)}%`,
      detail: "Troppi appuntamenti saltati — migliora la conferma",
      severity: "warning",
      route: "/azienda/marketing",
    });
  }

  // 4. Pipeline in calo
  if (p.pipelineDeclining) {
    actions.push({
      id: "pipeline-calo",
      icon: TrendingDown,
      label: "Pipeline in calo",
      detail: "Il valore delle opportunità sta diminuendo vs periodo precedente",
      severity: "warning",
      route: "/azienda/opportunita",
    });
  }

  // 5. Opportunità ferme
  if (p.staleOpportunities > 0) {
    actions.push({
      id: "opportunita-ferme",
      icon: Target,
      label: `${p.staleOpportunities} opportunità ferme da 7+ giorni`,
      detail: "Nessuna attività — rischio stallo nella pipeline",
      severity: "warning",
      route: "/azienda/opportunita",
    });
  }

  // 6. Appuntamenti pendenti
  if (p.pendingAppointments > 0) {
    actions.push({
      id: "appuntamenti-pendenti",
      icon: Calendar,
      label: `${p.pendingAppointments} appuntament${p.pendingAppointments === 1 ? "o" : "i"} da completare`,
      detail: "Data passata ma non segnati come svolti",
      severity: "info",
      route: "/azienda/calendario-crm",
    });
  }

  // 7. Close rate basso
  if (p.closeRate < 10 && p.contractsLost > 0) {
    actions.push({
      id: "close-rate",
      icon: TrendingDown,
      label: `Close rate solo ${p.closeRate.toFixed(0)}%`,
      detail: `${p.contractsLost} contratt${p.contractsLost === 1 ? "o perso" : "i persi"} — analizza le cause`,
      severity: "info",
      route: "/azienda/opportunita",
    });
  }

  return actions;
}

const severityStyles = {
  critical: {
    bg: "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50",
    border: "border-red-200 dark:border-red-800",
    icon: "text-red-600 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50",
    border: "border-amber-200 dark:border-amber-800",
    icon: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50",
    border: "border-blue-200 dark:border-blue-800",
    icon: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
};

export function AzioniCommerciali(props: Props) {
  const navigate = useNavigate();
  const allActions = buildActions(props);
  const topActions = allActions.slice(0, 3);

  if (topActions.length === 0) {
    return (
      <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Performance eccellente!</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">Nessuna azione urgente. Il team sta performando bene.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-foreground">Da fare oggi</h3>
        {allActions.length > 3 && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            +{allActions.length - 3} altr{allActions.length - 3 === 1 ? "a" : "e"}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {topActions.map((action, i) => {
          const styles = severityStyles[action.severity];
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => action.route && navigate(action.route)}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                styles.bg, styles.border,
                action.route && "cursor-pointer"
              )}
            >
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold flex-shrink-0", styles.badge)}>
                {i + 1}
              </span>
              <Icon className={cn("h-4 w-4 flex-shrink-0", styles.icon)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{action.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{action.detail}</p>
              </div>
              {action.route && <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
