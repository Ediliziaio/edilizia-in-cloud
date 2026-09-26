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
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";

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

// Le rotte erano «/azienda/contatti-crm», «/azienda/opportunita» e
// «/azienda/calendario-crm», che non esistono: il tocco finiva sulla home.
function buildActions(p: Props, base: string): UrgentAction[] {
  const actions: UrgentAction[] = [];

  // 1. Lead urgenti (< 2h)
  if (p.staleLeads2h > 0) {
    actions.push({
      id: "lead-2h",
      icon: UserX,
      label: `${p.staleLeads2h} lead da richiamare subito`,
      detail: "Non contattati da oltre 2 ore — ogni minuto conta",
      severity: "critical",
      route: `${base}/contatti?filter=stale_2h`,
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
      route: `${base}/contatti?filter=stale`,
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
      route: `${base}/calendario`,
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
      route: `${base}/opportunita`,
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
      route: `${base}/opportunita`,
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
      route: `${base}/calendario`,
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
      route: `${base}/opportunita`,
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
  const allActions = buildActions(props, useMarketingRoutePrefix());
  const topActions = allActions.slice(0, 3);

  if (topActions.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm dark:border-emerald-800 dark:from-slate-950 dark:to-emerald-950/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Nessuna urgenza commerciale</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">Nessuna azione urgente. Il team sta performando bene.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm max-sm:space-y-2 max-sm:p-3">
      <div className="flex items-start gap-3">
        {/* Telefono: il titolo basta; righe senza la spiegazione sotto. */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700 max-sm:hidden">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 max-sm:hidden">Priorità operative</p>
          <h3 className="text-sm font-bold text-foreground">Cosa muovere ora</h3>
        </div>
        {allActions.length > 3 && (
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
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
                "tap-compact w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md max-sm:gap-2",
                styles.bg, styles.border,
                action.route && "cursor-pointer"
              )}
            >
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold flex-shrink-0", styles.badge)}>
                {i + 1}
              </span>
              <Icon className={cn("h-4 w-4 flex-shrink-0 max-sm:hidden", styles.icon)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate max-sm:text-[13px]">{action.label}</p>
                <p className="text-[11px] text-muted-foreground truncate max-sm:hidden">{action.detail}</p>
              </div>
              {action.route && <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
