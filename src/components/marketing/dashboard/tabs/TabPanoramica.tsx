import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardStrategicKPI } from "@/components/marketing/dashboard/DashboardStrategicKPI";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import { Skeleton } from "@/components/ui/skeleton";
import { formatValue, calcDelta } from "@/components/marketing/dashboard/utils";
import type { DashboardStats, DashboardFiltersState } from "@/hooks/useMarketingDashboard";
import { usePercorsoLead, pct, pctTxt, tempo } from "@/components/marketing/dashboard/PercorsoLead";
import { fmt } from "@/components/marketing/dashboard/utils";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

/* ── KpiChip with optional threshold coloring ── */
function KpiChip({
  label,
  value,
  prevValue,
  format = "number",
  thresholds,
  soloComputer,
}: {
  label: string;
  /** sul telefono restano quattro cifre: questa no */
  soloComputer?: boolean;
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
    <div className={`flex flex-col gap-0.5 rounded-md border px-2 sm:px-3 py-1.5 min-w-0 overflow-hidden ${statusBg} ${soloComputer ? "max-sm:hidden" : ""}`}>
      <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight truncate max-sm:text-[11px]">{label}</span>
      <div className="flex items-baseline gap-1 sm:gap-1.5 min-w-0">
        <span className={`text-xs sm:text-sm font-semibold leading-tight truncate max-sm:text-[13px] ${statusText}`}>{displayValue}</span>
        {delta && delta.direction !== "flat" && (
          <span className={`flex items-center text-[9px] sm:text-[10px] flex-shrink-0 max-sm:text-[11px] ${delta.direction === "up" ? "text-green-600" : "text-red-600"}`}>
            {delta.direction === "up" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
            {delta.value}%
          </span>
        )}
      </div>
    </div>
  );
}

export const TabPanoramica = memo(function TabPanoramica({ data, isLoading, filters, assignedUserIds }: Props) {
  const isMobile = useIsMobile();
  const kpi = data?.kpi;
  const kpiPrev = data?.kpi_prev;
  // lo stesso percorso della scheda Pipeline (stessa cache): qui in quattro passi
  const { data: percorso } = usePercorsoLead(filters, assignedUserIds);
  const t = percorso?.totale;
  const passi = t
    ? [
        { label: "Lead arrivati", n: t.arrivati },
        { label: "Presi in carico", n: t.presi, nota: `in ${tempo(t.ore_presa_mediana)}` },
        { label: "Con appuntamento", n: t.appuntamenti },
        { label: "Vendite", n: t.vinti, nota: t.giorni_vendita != null ? `in ${t.giorni_vendita.toLocaleString("it-IT")} gg` : undefined },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Hero KPI e fila di cifre solo da computer: sul telefono fatturato,
          contratti, lead e show rate sono già nei quattro numeri in cima, e qui
          resta il percorso dal lead alla vendita. */}
      {!isMobile && <DashboardStrategicKPI kpi={kpi} kpiPrev={kpiPrev} isLoading={isLoading} />}

      {/* KPI strip: 6 core + divider + 2 call center */}
      {isLoading ? (
        <Skeleton className="h-14 w-full rounded-md" />
      ) : kpi ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 max-sm:hidden">
          <KpiChip label="Lead nuovi" value={kpi.leads_new} prevValue={kpiPrev?.leads_new ?? undefined} />
          <KpiChip soloComputer label="App. fissati" value={kpi.appointments_set} prevValue={kpiPrev?.appointments_set ?? undefined} />
          <KpiChip label="Da esitare" value={kpi.appointments_pending ?? 0} thresholds={{ warning: 0, critical: 5, higherIsBetter: false }} />
          {/* senza una base (nessuna chiusa, nessun esito, nessuna chiamata) il colore non vuol dire niente */}
          <KpiChip label="Chiusura" value={kpi.close_rate} prevValue={kpiPrev?.close_rate ?? undefined} format="percent"
            thresholds={(kpi.opps_won ?? 0) + kpi.contracts_lost > 0 ? { warning: 20, critical: 10 } : undefined} />
          <KpiChip label="Show rate" value={kpi.show_rate} prevValue={kpiPrev?.show_rate ?? undefined} format="percent"
            thresholds={kpi.appointments_done + (kpi.appointments_no_show ?? 0) > 0 ? { warning: 60, critical: 40 } : undefined} />
          <KpiChip soloComputer label="Ticket medio" value={kpi.avg_ticket} prevValue={kpiPrev?.avg_ticket ?? undefined} format="currency" />
          <KpiChip soloComputer label="Chiamate" value={kpi.calls_total} prevValue={kpiPrev?.calls_total ?? undefined} />
          <KpiChip soloComputer label="Risposta" value={kpi.contact_rate} prevValue={kpiPrev?.contact_rate ?? undefined} format="percent"
            thresholds={kpi.calls_total > 0 ? { warning: 50, critical: 30 } : undefined} />
        </div>
      ) : null}

      {/* Dal lead alla vendita + Team compatto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dal lead alla vendita</CardTitle>
            <p className="text-[11px] text-muted-foreground max-sm:hidden">Lead arrivati nel periodo e cosa ne è stato</p>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {passi.length === 0 ? (
              <Skeleton className="h-32 w-full" />
            ) : passi[0].n === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nessun lead arrivato nel periodo.</p>
            ) : passi.map((p, i) => (
              <div key={p.label} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-700">{p.label}</span>
                  <span className="tabular-nums">
                    <b className="text-sm text-slate-900">{fmt(p.n)}</b>
                    {i > 0 && <span className="ml-1.5 text-muted-foreground">{pctTxt(pct(p.n, passi[0].n))}</span>}
                    {p.nota && <span className="ml-1.5 text-muted-foreground">· {p.nota}</span>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div className={i === passi.length - 1 ? "h-1.5 rounded-full bg-emerald-500" : "h-1.5 rounded-full bg-blue-500"}
                    style={{ width: `${Math.max(2, (p.n / Math.max(passi[0].n, 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        {/* Telefono: la tabella del team resta al computer (come la scheda Team). */}
        <Card className="max-sm:hidden">
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
