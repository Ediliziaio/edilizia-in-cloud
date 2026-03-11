import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStrategicKPI } from "@/components/marketing/dashboard/DashboardStrategicKPI";
import { DashboardFunnel } from "@/components/marketing/dashboard/DashboardFunnel";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatValue, calcDelta } from "@/components/marketing/dashboard/utils";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

/* ── KpiChip with optional threshold coloring ── */
function KpiChip({
  label,
  value,
  prevValue,
  format = "number",
  thresholds,
}: {
  label: string;
  value: number;
  prevValue?: number;
  format?: "number" | "currency" | "percent";
  thresholds?: { warning: number; critical: number; higherIsBetter?: boolean };
}) {
  const displayValue = formatValue(value, format);
  const delta = prevValue !== undefined ? calcDelta(value, prevValue) : null;

  const chipStatus = (() => {
    if (!thresholds) return "neutral" as const;
    const { warning, critical, higherIsBetter = true } = thresholds;
    if (higherIsBetter) {
      if (value >= warning) return "good" as const;
      if (value >= critical) return "warning" as const;
      return "critical" as const;
    }
    if (value <= warning) return "good" as const;
    if (value <= critical) return "warning" as const;
    return "critical" as const;
  })();

  const statusBg = {
    good: "",
    neutral: "",
    warning: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
    critical: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
  }[chipStatus];

  const statusText = {
    good: "",
    neutral: "",
    warning: "text-yellow-700 dark:text-yellow-400",
    critical: "text-red-700 dark:text-red-400 font-bold",
  }[chipStatus];

  return (
    <div className={`flex flex-col gap-0.5 rounded-md border px-3 py-1.5 min-w-[100px] ${statusBg}`}>
      <span className="text-[10px] text-muted-foreground leading-tight truncate">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-sm font-semibold leading-tight ${statusText}`}>{displayValue}</span>
        {delta && delta.direction !== "flat" && (
          <span className={`flex items-center text-[10px] ${delta.direction === "up" ? "text-green-600" : "text-red-600"}`}>
            {delta.direction === "up" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
            {delta.value}%
          </span>
        )}
      </div>
    </div>
  );
}

export const TabPanoramica = memo(function TabPanoramica({ data, isLoading }: Props) {
  const kpi = data?.kpi;
  const kpiPrev = data?.kpi_prev;

  return (
    <div className="space-y-4">
      {/* Hero KPI */}
      <DashboardStrategicKPI kpi={kpi} kpiPrev={kpiPrev} isLoading={isLoading} />

      {/* KPI strip: 6 core + divider + 2 call center */}
      {isLoading ? (
        <Skeleton className="h-14 w-full rounded-md" />
      ) : kpi ? (
        <div className="flex flex-wrap items-center gap-2">
          <KpiChip label="Lead Totali" value={kpi.leads_total} prevValue={kpiPrev?.leads_total} />
          <KpiChip label="Nuovi Lead" value={kpi.leads_new} prevValue={kpiPrev?.leads_new} />
          <KpiChip label="App. Fissati" value={kpi.appointments_set} prevValue={kpiPrev?.appointments_set} />
          <KpiChip label="Chiusura %" value={kpi.close_rate} prevValue={kpiPrev?.close_rate} format="percent" thresholds={{ warning: 20, critical: 10 }} />
          <KpiChip label="Show Rate" value={kpi.show_rate} prevValue={kpiPrev?.show_rate} format="percent" thresholds={{ warning: 60, critical: 40 }} />
          <KpiChip label="Ticket Medio" value={kpi.avg_ticket} prevValue={kpiPrev?.avg_ticket} format="currency" />

          <Separator orientation="vertical" className="h-10 mx-1" />

          <KpiChip label="📞 Chiamate" value={kpi.calls_total} prevValue={kpiPrev?.calls_total} />
          <KpiChip label="Tasso Risp." value={kpi.contact_rate} prevValue={kpiPrev?.contact_rate} format="percent" thresholds={{ warning: 50, critical: 30 }} />
        </div>
      ) : null}

      {/* Funnel + Team compatto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DashboardFunnel funnel={data?.funnel} isLoading={isLoading} compact />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Team</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <DashboardSalesTable sales={data?.sales_performance} isLoading={isLoading} compact />
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
