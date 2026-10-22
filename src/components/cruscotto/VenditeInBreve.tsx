import { useNavigate } from "react-router-dom";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrencyCompact } from "@/lib/formatters";
import { safeNumber } from "@/lib/numberUtils";
import type { KpiData } from "@/hooks/useMarketingDashboard";

/**
 * Le vendite in sei numeri, dalla stessa funzione della Dashboard marketing
 * (get_marketing_dashboard_stats) e con lo stesso periodo del Cruscotto.
 *
 * Prima qui c'erano le copie di mezza dashboard marketing — classifica dei
 * commerciali, pipeline per fase, forecast e fonti, con «Forecast & Pipeline»
 * due volte nella stessa scheda — più la scheda «Team / sedi» con altre due
 * copie. L'approfondimento sta in un posto solo: il bottone porta là.
 */
export function VenditeInBreve({ kpi, isLoading, periodo }: { kpi: KpiData | undefined; isLoading: boolean; periodo: string }) {
  const navigate = useNavigate();
  const perms = usePermissions();
  if (isLoading) return <Skeleton className="h-36 w-full rounded-xl" />;
  if (!kpi) return null;

  const eur = (v: number | null | undefined) => formatCurrencyCompact(safeNumber(v));
  const pct = (v: number | null | undefined) => `${safeNumber(v).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
  const numeri = [
    { label: "Vendite", valore: String(safeNumber(kpi.contracts_won)), nota: eur(kpi.revenue) },
    { label: "Lead nuovi", valore: String(safeNumber(kpi.leads_new)), nota: `${safeNumber(kpi.appointments_set)} appuntamenti` },
    { label: "Chiusura", valore: pct(kpi.close_rate), nota: "vinte ÷ (vinte + perse)" },
    { label: "Da esitare", valore: String(safeNumber(kpi.appointments_pending)), nota: "appuntamenti passati" },
    { label: "Pipeline aperta", valore: eur(kpi.pipeline_active_value), nota: `${safeNumber(kpi.open_opps_count)} opportunità oggi` },
    { label: "Pipeline pesata", valore: eur(kpi.weighted_pipeline), nota: "valore × probabilità" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Vendite · {periodo}
          </CardTitle>
          {(perms.isAdmin || perms.canViewMarketingDashboard) && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate("/azienda/marketing")}>
              Dashboard marketing <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {numeri.map((n) => (
            <div key={n.label} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
              <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{n.label}</div>
              <div className="text-lg font-bold tabular-nums text-slate-900">{n.valore}</div>
              <div className="truncate text-[11px] text-muted-foreground">{n.nota}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
