import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertsData } from "@/hooks/useMarketingDashboard";
import type { OperationsData, FinanceData, TodayData } from "@/hooks/useCruscottoData";

interface AlertItem {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  body: string;
  cta: string;
  link: string;
}

interface Props {
  marketingAlerts: AlertsData | undefined;
  operations: OperationsData;
  finance: FinanceData;
  todayData: TodayData | null;
  isLoading?: boolean;
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function buildAlerts(ma: AlertsData | undefined, ops: OperationsData, fin: FinanceData, today: TodayData | null): AlertItem[] {
  const alerts: AlertItem[] = [];

  // Marketing
  if ((ma?.stale_leads ?? 0) > 0)
    alerts.push({ id: "stale-leads", level: "critical", title: `${ma!.stale_leads} lead non contattati da 48h+`, body: "Ogni ora persa riduce la probabilità di chiusura. Assegna un follow-up immediato.", cta: "Vai ai contatti", link: "/azienda/marketing/contatti" });
  if ((ma?.pending_appointments ?? 0) > 0)
    alerts.push({ id: "pending-appointments", level: "warning", title: `${ma!.pending_appointments} appuntamenti passati non completati`, body: "Aggiorna lo stato o riprogramma per non perdere traccia delle trattative.", cta: "Vedi calendario", link: "/azienda/marketing/calendario" });
  if ((ma?.stale_opportunities ?? 0) > 0)
    alerts.push({ id: "stale-opps", level: "warning", title: `${ma!.stale_opportunities} opportunità ferme da 7+ giorni`, body: "Le trattative inattive si raffreddano. Riattiva o archivia.", cta: "Vedi opportunità", link: "/azienda/marketing/opportunita" });
  if (ma?.show_rate_below_threshold)
    alerts.push({ id: "show-rate", level: "warning", title: "Show rate sotto il 60%", body: "Troppi appuntamenti non si presentano. Verifica la qualità dei lead e la fase di conferma.", cta: "Analizza marketing", link: "/azienda/marketing" });
  if (ma?.pipeline_declining)
    alerts.push({ id: "pipeline-declining", level: "warning", title: "Pipeline commerciale in calo", body: "Il valore delle opportunità attive è diminuito rispetto al periodo precedente.", cta: "Vedi pipeline", link: "/azienda/marketing/opportunita" });

  // Operations
  if (ops.overduePayments > 0)
    alerts.push({ id: "overdue-payments", level: "critical", title: `${ops.overduePayments} pagamenti scaduti — ${fmtEur(ops.overdueAmount)}`, body: "Clienti con rate non pagate. Sollecita prima che si allunghino i tempi.", cta: "Vai agli ordini", link: "/azienda/ordini" });
  if (ops.lateOrders > 0)
    alerts.push({ id: "late-orders", level: "warning", title: `${ops.lateOrders} ordini in ritardo sulla data prevista`, body: "Verifica lo stato avanzamento e aggiorna il cliente prima che si lamenti.", cta: "Vedi ordini", link: "/azienda/ordini" });

  // Finance
  if (fin.cashFlowNet < 0)
    alerts.push({ id: "negative-cashflow", level: "critical", title: `Cash flow negativo questo mese: ${fmtEur(fin.cashFlowNet)}`, body: "Le uscite superano le entrate. Sollecita incassi o posticipa uscite non urgenti.", cta: "Analizza costi", link: "/azienda/costi" });

  // Today data alerts
  if ((today?.overdueCount ?? 0) > 0)
    alerts.push({ id: "overdue-receivables", level: "critical", title: `${today!.overdueCount} rate non incassate — ${fmtEur(today!.overdueAmount)}`, body: "Rate di pagamento con data già scaduta non ancora incassate. Contatta i clienti.", cta: "Gestisci ordini", link: "/azienda/ordini" });
  if ((today?.suppliersDue?.length ?? 0) > 0)
    alerts.push({ id: "suppliers-due", level: "warning", title: `${today!.suppliersDue!.length} fornitori da pagare nei prossimi 7 giorni`, body: `${fmtEur(today!.suppliersDueAmount)} di uscite programmate. Verifica la liquidità disponibile.`, cta: "Vedi costi", link: "/azienda/costi" });

  return alerts.sort((a, b) =>
    a.level === "critical" && b.level !== "critical" ? -1 :
    b.level === "critical" && a.level !== "critical" ? 1 :
    a.level === "warning" && b.level === "info" ? -1 :
    b.level === "warning" && a.level === "info" ? 1 : 0
  );
}

export function AlertPanel({ marketingAlerts, operations, finance, todayData, isLoading }: Props) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const alerts = useMemo(
    () => buildAlerts(marketingAlerts, operations, finance, todayData),
    [marketingAlerts, operations, finance, todayData]
  );

  if (isLoading) return (
    <div className="space-y-2">
      {[...Array(2)].map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-xl" />
      ))}
    </div>
  );

  if (!alerts.length) return (
    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl px-5 py-3 flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 text-green-600" />
      <span className="text-sm font-medium text-green-700 dark:text-green-400">0 Alert attivi — Tutto sotto controllo</span>
    </div>
  );

  const visible = showAll ? alerts : alerts.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {alerts.length} Alert{alerts.length > 1 ? "s" : ""}
        </span>
        {alerts.length > 3 && (
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setShowAll(!showAll)}>
            {showAll ? <>Mostra meno <ChevronUp className="w-3 h-3" /></> : <>Mostra tutti <ChevronDown className="w-3 h-3" /></>}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {visible.map(alert => (
          <div
            key={alert.id}
            className={cn(
              "rounded-xl px-4 py-3 flex items-start gap-3 transition-colors",
              alert.level === "critical" && "bg-destructive/8 border border-destructive/20",
              alert.level === "warning" && "bg-amber-500/8 border border-amber-500/20",
              alert.level === "info" && "bg-blue-500/8 border border-blue-500/20",
            )}
          >
            <AlertTriangle className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              alert.level === "critical" && "text-destructive",
              alert.level === "warning" && "text-amber-600",
              alert.level === "info" && "text-blue-600",
            )} />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-semibold",
                alert.level === "critical" && "text-destructive",
                alert.level === "warning" && "text-amber-700 dark:text-amber-400",
                alert.level === "info" && "text-blue-700 dark:text-blue-400",
              )}>{alert.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{alert.body}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs h-7 gap-1"
              onClick={() => navigate(alert.link)}
            >
              {alert.cta}
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
