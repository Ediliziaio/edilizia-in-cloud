import { memo, useMemo } from "react";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import { fmt, fmtCur } from "@/components/marketing/dashboard/utils";
import { usePercorsoLead, tempo } from "@/components/marketing/dashboard/PercorsoLead";
import type { DashboardStats, DashboardFiltersState } from "@/hooks/useMarketingDashboard";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecalculateAllLeadScores } from "@/hooks/useSalesOS";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/*
 * Tab «Team»: la classifica dei commerciali — vendite, fatturato, chiusura,
 * appuntamenti — con il tempo al primo contatto e la conversione dei lead dal
 * percorso dei lead. Le chiamate per operatore stanno in «Attività» (prima
 * c'erano qui e lì, uguali).
 */

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

export const TabTeam = memo(function TabTeam({ data, isLoading, filters, assignedUserIds }: Props) {
  const { effectiveCompany } = useAuth();
  // L'azienda che si sta guardando, non quella del proprio profilo: con «Stai
  // visualizzando» o con più aziende il ricalcolo finiva sull'azienda sbagliata.
  const companyId = effectiveCompany?.id ?? null;
  const recalcAll = useRecalculateAllLeadScores(companyId);
  const { data: percorso } = usePercorsoLead(filters, assignedUserIds);

  const perUtente = useMemo(() => {
    const m = new Map<string, { arrivati: number; ore: number | null; vinti: number }>();
    for (const c of percorso?.commerciali ?? []) {
      if (c.user_id) m.set(c.user_id, { arrivati: c.arrivati, ore: c.ore_presa_mediana, vinti: c.vinti });
    }
    return m;
  }, [percorso?.commerciali]);

  const kpi = data?.kpi;
  const nonAssegnati = percorso?.commerciali.find((c) => !c.user_id);

  const handleRecalculate = () => {
    recalcAll.mutate(undefined, {
      onSuccess: (result) => toast.success(`Lead Score ricalcolato per ${result.updated} contatti`),
      onError: () => toast.error("Errore durante il ricalcolo dei Lead Score"),
    });
  };

  const sintesi = [
    { label: "Vendite", valore: fmt(kpi?.contracts_won ?? 0), nota: kpi ? fmtCur(kpi.revenue) : undefined },
    { label: "Ticket medio", valore: fmtCur(kpi?.avg_ticket ?? 0) },
    { label: "Chiusura", valore: `${Math.round(kpi?.close_rate ?? 0)}%`, nota: "vinte ÷ (vinte + perse)" },
    { label: "1° contatto", valore: tempo(percorso?.totale.ore_presa_mediana ?? null), nota: "tempo mediano" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {sintesi.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="text-lg font-bold tabular-nums text-slate-900">{s.valore}</div>
            {s.nota && <div className="truncate text-[11px] text-muted-foreground">{s.nota}</div>}
          </div>
        ))}
      </div>

      {nonAssegnati && nonAssegnati.arrivati > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {fmt(nonAssegnati.arrivati)} lead del periodo non hanno un commerciale: nessuno li ha in carico e nessuno li ha lavorati.
        </p>
      )}

      <DashboardSalesTable
        sales={data?.sales_performance}
        isLoading={isLoading}
        percorso={perUtente}
        mostraObiettivo={filters.datePreset === "month"}
      />

      <div className="flex justify-end max-sm:hidden">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={handleRecalculate} disabled={recalcAll.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${recalcAll.isPending ? "animate-spin" : ""}`} />
          {recalcAll.isPending ? "Ricalcolo…" : "Ricalcola lead score"}
        </Button>
      </div>
    </div>
  );
});
