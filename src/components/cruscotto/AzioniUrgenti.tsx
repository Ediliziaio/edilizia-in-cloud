/**
 * AzioniUrgenti — "3 cose da fare OGGI"
 *
 * Mostra le azioni più urgenti cliccabili che portano all'azione.
 * Priorità: scaduti > ritardi > cassa negativa > lead freddi > bozze fattura
 */

import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Clock, Wallet, UserX, FileText,
  CheckCircle2, ChevronRight, Zap
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

interface AzioniUrgentiProps {
  overduePayments: number;
  overdueAmount: number;
  lateOrders: number;
  cashFlowNet: number;
  staleLeads?: number;
  fattureBozza?: number;
  proformaAperti?: number;
  fattureScadute?: number;
  fattureScaduteAmount?: number;
  suppliersDueAmount?: number;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toFixed(0)} €`;
}

function buildActions(p: AzioniUrgentiProps): UrgentAction[] {
  const actions: UrgentAction[] = [];

  // 1. Fatture scadute (billing nativo)
  if (p.fattureScadute && p.fattureScadute > 0) {
    actions.push({
      id: "fatture-scadute",
      icon: AlertTriangle,
      label: `${p.fattureScadute} fattur${p.fattureScadute === 1 ? "a" : "e"} scadut${p.fattureScadute === 1 ? "a" : "e"}`,
      detail: `${fmt(p.fattureScaduteAmount ?? 0)} da incassare — sollecita i clienti`,
      severity: "critical",
      route: "/azienda/documenti?tipo=fattura",
    });
  }

  // 2. Rate scadute (installments)
  if (p.overduePayments > 0) {
    actions.push({
      id: "rate-scadute",
      icon: AlertTriangle,
      label: `${p.overduePayments} rat${p.overduePayments === 1 ? "a" : "e"} scadut${p.overduePayments === 1 ? "a" : "e"}`,
      detail: `${fmt(p.overdueAmount)} da incassare — controlla lo scadenzario`,
      severity: "critical",
      route: "/azienda/scadenzario",
    });
  }

  // 3. Ordini in ritardo
  if (p.lateOrders > 0) {
    actions.push({
      id: "ordini-ritardo",
      icon: Clock,
      label: `${p.lateOrders} ordin${p.lateOrders === 1 ? "e" : "i"} in ritardo`,
      detail: "Controlla le consegne e aggiorna le date previste",
      severity: "critical",
      route: "/azienda/ordini",
    });
  }

  // 4. Cash flow negativo
  if (p.cashFlowNet < 0) {
    actions.push({
      id: "cash-negativo",
      icon: Wallet,
      label: "Cash flow negativo",
      detail: `${fmt(p.cashFlowNet)} — le uscite superano le entrate questo mese`,
      severity: "warning",
      route: "/azienda/prima-nota",
    });
  }

  // 5. Fornitori da pagare
  if (p.suppliersDueAmount && p.suppliersDueAmount > 0) {
    actions.push({
      id: "fornitori-scadenza",
      icon: Wallet,
      label: `Fornitori da pagare: ${fmt(p.suppliersDueAmount)}`,
      detail: "Costi in scadenza nei prossimi 7 giorni",
      severity: "warning",
      route: "/azienda/costi",
    });
  }

  // 6. Lead da contattare
  if (p.staleLeads && p.staleLeads > 0) {
    actions.push({
      id: "lead-freddi",
      icon: UserX,
      label: `${p.staleLeads} lead da contattare`,
      detail: "Non contattati da oltre 48 ore — rischi di perderli",
      severity: "warning",
      route: "/azienda/marketing",
    });
  }

  // 7. Fatture in bozza
  if (p.fattureBozza && p.fattureBozza > 0) {
    actions.push({
      id: "bozze-fattura",
      icon: FileText,
      label: `${p.fattureBozza} fattur${p.fattureBozza === 1 ? "a" : "e"} in bozza`,
      detail: "Da completare e inviare al SDI",
      severity: "info",
      route: "/azienda/documenti?tipo=fattura",
    });
  }

  // 8. Proforma da convertire
  if (p.proformaAperti && p.proformaAperti > 0) {
    actions.push({
      id: "proforma",
      icon: FileText,
      label: `${p.proformaAperti} proforma da convertire`,
      detail: "Converti in fattura quando il cliente paga",
      severity: "info",
      route: "/azienda/documenti?tipo=proforma",
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

export function AzioniUrgenti(props: AzioniUrgentiProps) {
  const navigate = useNavigate();
  const allActions = buildActions(props);
  const topActions = allActions.slice(0, 3);

  // Tutto ok → messaggio positivo
  if (topActions.length === 0) {
    return (
      <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Tutto sotto controllo!</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">Nessuna azione urgente oggi. Ottimo lavoro.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-foreground">Da fare oggi</h3>
        {allActions.length > 3 && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            +{allActions.length - 3} altr{allActions.length - 3 === 1 ? "a" : "e"}
          </span>
        )}
      </div>

      {/* Action list */}
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
              {/* Numero step */}
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold flex-shrink-0",
                styles.badge
              )}>
                {i + 1}
              </span>

              {/* Icona */}
              <Icon className={cn("h-4 w-4 flex-shrink-0", styles.icon)} />

              {/* Testo */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{action.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{action.detail}</p>
              </div>

              {/* Arrow */}
              {action.route && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
