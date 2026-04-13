/**
 * AzioniOperative — "Da fare oggi" per Dashboard Gestione
 *
 * Priorità: cash flow negativo > ticket aperti > urgenze magazzino > scadenze fornitori
 */

import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, HeadphonesIcon, Wallet, Package,
  CalendarClock, CheckCircle2, ChevronRight, Zap
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
  netCashFlow: number;
  openTickets: number;
  urgentItemsCount: number;
  financialAlertsCount: number;
  upcomingWorks: number;
  receivablesCount: number;
  companyCostsCount: number;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toFixed(0)} €`;
}

function buildActions(p: Props): UrgentAction[] {
  const actions: UrgentAction[] = [];

  if (p.netCashFlow < 0) {
    actions.push({
      id: "cash-negativo",
      icon: Wallet,
      label: "Cash flow negativo",
      detail: `${fmt(p.netCashFlow)} — le uscite superano le entrate`,
      severity: "critical",
      route: "/azienda/previsionale",
    });
  }

  if (p.openTickets > 0) {
    actions.push({
      id: "ticket-aperti",
      icon: HeadphonesIcon,
      label: `${p.openTickets} ticket apert${p.openTickets === 1 ? "o" : "i"}`,
      detail: "Rispondi ai clienti in attesa",
      severity: p.openTickets > 3 ? "critical" : "warning",
      route: "/azienda/ticket",
    });
  }

  if (p.urgentItemsCount > 0) {
    actions.push({
      id: "magazzino-urgente",
      icon: Package,
      label: `${p.urgentItemsCount} articol${p.urgentItemsCount === 1 ? "o" : "i"} urgenti in magazzino`,
      detail: "Posa imminente — verifica disponibilità",
      severity: "warning",
      route: "/azienda/magazzino",
    });
  }

  if (p.financialAlertsCount > 0) {
    actions.push({
      id: "alert-finanziari",
      icon: AlertTriangle,
      label: `${p.financialAlertsCount} alert finanziari`,
      detail: "Controlla lo stato finanziario dell'azienda",
      severity: "warning",
      route: "/azienda/prima-nota",
    });
  }

  if (p.receivablesCount > 0) {
    actions.push({
      id: "crediti-settimana",
      icon: CalendarClock,
      label: `${p.receivablesCount} incassi in scadenza`,
      detail: "Rate da incassare questa settimana",
      severity: "info",
      route: "/azienda/scadenzario",
    });
  }

  if (p.companyCostsCount > 0) {
    actions.push({
      id: "costi-settimana",
      icon: Wallet,
      label: `${p.companyCostsCount} costi da pagare`,
      detail: "Fornitori da saldare questa settimana",
      severity: "info",
      route: "/azienda/costi",
    });
  }

  if (p.upcomingWorks > 0) {
    actions.push({
      id: "lavori-settimana",
      icon: CalendarClock,
      label: `${p.upcomingWorks} lavor${p.upcomingWorks === 1 ? "o" : "i"} in programma`,
      detail: "Consegne e installazioni questa settimana",
      severity: "info",
      route: "/azienda/ordini",
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

export function AzioniOperative(props: Props) {
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
            <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Tutto sotto controllo!</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">Nessuna azione urgente. Ottimo lavoro.</p>
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
