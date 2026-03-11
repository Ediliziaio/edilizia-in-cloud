import { memo } from "react";
import { Card } from "@/components/ui/card";
import { DashboardCallCenter } from "@/components/marketing/dashboard/DashboardCallCenter";
import { fmt, calcDelta, formatDuration } from "@/components/marketing/dashboard/utils";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { Phone } from "lucide-react";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

type Status = "good" | "warning" | "critical" | "neutral";

function StatusCard({ label, value, sub, status }: { label: string; value: string; sub: string | null; status: Status }) {
  const cardColors: Record<Status, string> = {
    good: "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30",
    warning: "border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/30",
    critical: "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30",
    neutral: "",
  };
  const valueColors: Record<Status, string> = {
    good: "text-green-700 dark:text-green-400",
    warning: "text-yellow-700 dark:text-yellow-400",
    critical: "text-red-700 dark:text-red-400",
    neutral: "",
  };

  return (
    <Card className={`p-3 ${cardColors[status]}`}>
      <p className="text-[11px] text-muted-foreground font-medium truncate">{label}</p>
      <p className={`text-xl font-bold tracking-tight ${valueColors[status]}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

export const TabAttivita = memo(function TabAttivita({ data, isLoading }: Props) {
  const kpi = data?.kpi;
  const kpiPrev = data?.kpi_prev;

  const cc = data?.call_center;
  const callCenterSummary = cc && cc.length > 0
    ? {
        totalCalls: cc.reduce((s, r) => s + r.calls_total, 0),
        totalAnswered: cc.reduce((s, r) => s + r.calls_answered, 0),
        totalAppSet: cc.reduce((s, r) => s + r.appointments_set, 0),
        avgDuration: Math.round(
          cc.reduce((s, r) => s + r.avg_duration_sec, 0) /
          (cc.filter(r => r.avg_duration_sec > 0).length || 1)
        ),
        operatorsCount: cc.length,
        contactRate: cc.reduce((s, r) => s + r.calls_total, 0) > 0
          ? (cc.reduce((s, r) => s + r.calls_answered, 0) / cc.reduce((s, r) => s + r.calls_total, 0)) * 100
          : 0,
      }
    : null;

  if (!kpi) return null;

  const showRateDelta = kpiPrev ? calcDelta(kpi.appointments_set, kpiPrev.appointments_set) : null;

  return (
    <div className="space-y-6">
      {/* === APPUNTAMENTI === */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Appuntamenti</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusCard
            label="App. Fissati"
            value={fmt(kpi.appointments_set)}
            sub={showRateDelta ? `${showRateDelta.direction === "up" ? "+" : "-"}${showRateDelta.value}% vs prec.` : null}
            status="neutral"
          />
          <StatusCard label="App. Svolti" value={fmt(kpi.appointments_done)} sub={null} status="neutral" />
          <StatusCard
            label="Show Rate"
            value={`${kpi.show_rate}%`}
            sub="Soglia: 60%"
            status={kpi.show_rate >= 60 ? "good" : kpi.show_rate >= 40 ? "warning" : "critical"}
          />
          <StatusCard label="Contatti Lavorati" value={fmt(kpi.contacts_worked)} sub={null} status="neutral" />
        </div>
      </div>

      {/* === CALL CENTER === */}
      {callCenterSummary ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Call Center</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <StatusCard
              label="Chiamate Totali"
              value={fmt(callCenterSummary.totalCalls)}
              sub={`${callCenterSummary.operatorsCount} operator${callCenterSummary.operatorsCount === 1 ? "e" : "i"}`}
              status="neutral"
            />
            <StatusCard label="Risposte" value={fmt(callCenterSummary.totalAnswered)} sub={null} status="neutral" />
            <StatusCard
              label="Tasso Risposta"
              value={`${callCenterSummary.contactRate.toFixed(1)}%`}
              sub="Soglia: 50%"
              status={callCenterSummary.contactRate >= 50 ? "good" : callCenterSummary.contactRate >= 30 ? "warning" : "critical"}
            />
            <StatusCard label="Durata Media" value={formatDuration(callCenterSummary.avgDuration)} sub={null} status="neutral" />
            <StatusCard
              label="App. da Chiamate"
              value={fmt(callCenterSummary.totalAppSet)}
              sub={callCenterSummary.totalCalls > 0 ? `${((callCenterSummary.totalAppSet / callCenterSummary.totalCalls) * 100).toFixed(1)}% conv.` : null}
              status="neutral"
            />
          </div>

          <Card className="p-0">
            <div className="px-4 py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">Dettaglio per Operatore</span>
            </div>
            <DashboardCallCenter callCenter={data?.call_center} isLoading={false} />
          </Card>
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground font-medium">Nessun dato call center per il periodo selezionato.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">I dati appaiono quando vengono registrate chiamate nel sistema.</p>
        </Card>
      )}
    </div>
  );
});
