import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiData, SalesPerformance, SourceAnalysis, AlertsData } from "@/hooks/useMarketingDashboard";

interface Props {
  kpi: KpiData | undefined;
  kpiPrev: KpiData | undefined;
  sales: SalesPerformance[] | undefined;
  sources: SourceAnalysis[] | undefined;
  alerts: AlertsData | undefined;
  isLoading: boolean;
}

interface Insight {
  text: string;
  type: "positive" | "negative" | "warning" | "info";
  icon: React.ElementType;
}

const EMPTY_ALERTS: AlertsData = {
  stale_leads: 0,
  stale_leads_2h: 0,
  stale_opportunities: 0,
  pending_appointments: 0,
  show_rate_below_threshold: false,
  pipeline_declining: false,
};

function generateInsights(kpi: KpiData, kpiPrev: KpiData, sales: SalesPerformance[], sources: SourceAnalysis[], alerts: AlertsData): Insight[] {
  const insights: Insight[] = [];

  // Close rate trend
  const closeRateDelta = kpi.close_rate - kpiPrev.close_rate;
  if (Math.abs(closeRateDelta) >= 5) {
    insights.push({
      text: `Il tasso di chiusura è ${closeRateDelta > 0 ? "in crescita" : "in calo"} del ${Math.abs(Math.round(closeRateDelta))}% rispetto al periodo precedente.`,
      type: closeRateDelta > 0 ? "positive" : "negative",
      icon: closeRateDelta > 0 ? TrendingUp : TrendingDown,
    });
  }

  // Best ROI source
  const sourcesWithRoi = sources.filter(s => s.roi_pct !== null && s.roi_pct !== undefined && s.spend > 0);
  if (sourcesWithRoi.length > 0) {
    const best = sourcesWithRoi.reduce((a, b) => ((a.roi_pct ?? 0) > (b.roi_pct ?? 0) ? a : b));
    if ((best.roi_pct ?? 0) > 0) {
      insights.push({
        text: `La fonte "${best.source}" ha il miglior ROI: ${Math.round(best.roi_pct ?? 0)}%.`,
        type: "positive",
        icon: Award,
      });
    }
  }

  // Top performer
  if (sales.length >= 2) {
    const avgRevenue = sales.reduce((s, r) => s + r.revenue, 0) / sales.length;
    const top = sales[0];
    if (top && avgRevenue > 0) {
      const pctAbove = Math.round(((top.revenue - avgRevenue) / avgRevenue) * 100);
      if (pctAbove > 20) {
        insights.push({
          text: `${top.name} è sopra la media del team del ${pctAbove}% per fatturato.`,
          type: "positive",
          icon: Award,
        });
      }
    }
  }

  // Show rate alert
  if (kpi.show_rate < 60 && kpi.appointments_set >= 5) {
    insights.push({
      text: `Lo show rate è al ${kpi.show_rate}% — sotto la soglia consigliata del 60%.`,
      type: "warning",
      icon: AlertTriangle,
    });
  }

  // Bottleneck: appointment_to_contract low
  const apptToContract = Number(kpi.appointment_to_contract_rate ?? 0);
  const leadToAppt = Number(kpi.lead_to_appointment_rate ?? 0);
  if (apptToContract > 0 && leadToAppt > 0 && apptToContract < leadToAppt * 0.5) {
    insights.push({
      text: `La fase Appuntamento → Contratto (${apptToContract}%) è il principale collo di bottiglia.`,
      type: "negative",
      icon: TrendingDown,
    });
  }

  // Revenue trend
  const revDelta = kpiPrev.revenue > 0 ? ((kpi.revenue - kpiPrev.revenue) / kpiPrev.revenue) * 100 : 0;
  if (Math.abs(revDelta) >= 10) {
    insights.push({
      text: `Il fatturato è ${revDelta > 0 ? "cresciuto" : "calato"} del ${Math.abs(Math.round(revDelta))}%.`,
      type: revDelta > 0 ? "positive" : "negative",
      icon: revDelta > 0 ? TrendingUp : TrendingDown,
    });
  }

  // Contracts lost > won
  if (kpi.contracts_lost > 0 && kpi.contracts_lost > kpi.contracts_won) {
    insights.push({
      text: `I contratti persi (${kpi.contracts_lost}) superano quelli vinti (${kpi.contracts_won}) — analizzare le cause.`,
      type: "negative",
      icon: TrendingDown,
    });
  }

  // Stale leads
  const staleTotal = (alerts.stale_leads ?? 0) + (alerts.stale_leads_2h ?? 0);
  if (staleTotal > 5) {
    insights.push({
      text: `${staleTotal} lead non contattati — rischio di perdere opportunità.`,
      type: "warning",
      icon: AlertTriangle,
    });
  }

  // NEW: Median cycle > 30 days
  const medianCycle = Number(kpi.median_lead_to_won_days ?? 0);
  if (medianCycle > 30) {
    insights.push({
      text: `Il ciclo di vendita mediano è di ${medianCycle} giorni — valutare come accelerare.`,
      type: "warning",
      icon: AlertTriangle,
    });
  }

  // NEW: RPL < CPL
  const rpl = Number(kpi.rpl ?? 0);
  const cpl = Number(kpi.cpl ?? 0);
  if (rpl > 0 && cpl > 0 && rpl < cpl) {
    insights.push({
      text: `Il Revenue per Lead (€${rpl}) è inferiore al Costo per Lead (€${cpl}) — le campagne non sono sostenibili.`,
      type: "negative",
      icon: TrendingDown,
    });
  }

  // NEW: Sales velocity declining
  const salesVelocity = Number(kpi.sales_velocity ?? 0);
  const prevSalesVelocity = Number(kpiPrev.sales_velocity ?? 0);
  if (prevSalesVelocity > 0 && salesVelocity < prevSalesVelocity * 0.8) {
    insights.push({
      text: `La Sales Velocity è in calo del ${Math.round(((prevSalesVelocity - salesVelocity) / prevSalesVelocity) * 100)}% — la pipeline genera fatturato più lentamente.`,
      type: "negative",
      icon: TrendingDown,
    });
  }

  return insights.slice(0, 6);
}

export const DashboardInsights = memo(function DashboardInsights({ kpi, kpiPrev, sales, sources, alerts, isLoading }: Props) {
  const safeAlerts = useMemo(() => alerts ? { ...EMPTY_ALERTS, ...alerts } : EMPTY_ALERTS, [alerts]);
  const insights = useMemo(
    () => (kpi && kpiPrev) ? generateInsights(kpi, kpiPrev, sales || [], sources || [], safeAlerts) : [],
    [kpi, kpiPrev, sales, sources, safeAlerts]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Sintesi Strategica</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  if (!kpi || !kpiPrev || insights.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">Sintesi Strategica</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {insights.map((insight, i) => {
            const Icon = insight.icon;
            return (
              <div key={i} className={cn(
                "flex items-start gap-3 p-3 rounded-lg border text-sm",
                insight.type === "positive" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30",
                insight.type === "negative" && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30",
                insight.type === "warning" && "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30",
                insight.type === "info" && "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30",
              )}>
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5",
                  insight.type === "positive" && "text-emerald-600 dark:text-emerald-400",
                  insight.type === "negative" && "text-red-600 dark:text-red-400",
                  insight.type === "warning" && "text-amber-600 dark:text-amber-400",
                  insight.type === "info" && "text-blue-600 dark:text-blue-400",
                )} />
                <span>{insight.text}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
