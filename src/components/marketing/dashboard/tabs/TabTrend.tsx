import { memo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DashboardTrendChart } from "@/components/marketing/dashboard/DashboardTrendChart";
import { calcDelta, fmt, fmtCur } from "@/components/marketing/dashboard/utils";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

/*
 * Tab «Trend»: l'andamento del periodo e, sopra, i totali messi accanto al
 * periodo precedente (stessa durata, subito prima), così si vede se si sta
 * andando meglio o peggio senza fare i conti a mano.
 */
export const TabTrend = memo(function TabTrend({ data, isLoading }: Props) {
  const k = data?.kpi;
  const p = data?.kpi_prev;
  const voci = k
    ? [
        { label: "Lead nuovi", ora: k.leads_new, prima: p?.leads_new, f: fmt },
        { label: "Appuntamenti", ora: k.appointments_set, prima: p?.appointments_set, f: fmt },
        { label: "Vendite", ora: k.contracts_won, prima: p?.contracts_won, f: fmt },
        { label: "Fatturato", ora: k.revenue, prima: p?.revenue, f: fmtCur },
        { label: "Show rate", ora: k.show_rate, prima: p?.show_rate, f: (v: number) => `${v}%` },
        { label: "Chiusura", ora: k.close_rate, prima: p?.close_rate, f: (v: number) => `${v}%` },
      ]
    : [];

  return (
    <div className="space-y-4">
      {voci.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {voci.map((v) => {
            const d = v.prima == null ? null : calcDelta(Number(v.ora), Number(v.prima));
            return (
              <div key={v.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{v.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums text-slate-900">{v.f(Number(v.ora))}</span>
                  {d && d.direction !== "flat" && Number(v.prima) > 0 && (
                    <span className={cn("inline-flex items-center text-[11px] font-semibold", d.direction === "up" ? "text-emerald-600" : "text-red-600")}>
                      {d.direction === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{d.value}%
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">prima: {v.prima == null ? "—" : v.f(Number(v.prima))}</div>
              </div>
            );
          })}
        </div>
      )}
      <DashboardTrendChart trend={data?.trend} isLoading={isLoading} />
    </div>
  );
});
