import { AlertTriangle, CalendarClock, Clock, TrendingDown, TrendingUp } from "lucide-react";
import type { ScadenzarioSummary } from "@/hooks/useScadenzario";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { domenicaDi } from "@/lib/finance/incassiSettimanali";

// Nei KPI di testata niente centesimi: piu' leggibili, mai troncati
// (stessa scelta del riepilogo Commesse e dei Costi).
const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);

interface Props {
  summary: ScadenzarioSummary | undefined;
  isLoading: boolean;
  /** Es. "max-sm:hidden": su telefono la pagina mostra due numeri suoi. */
  className?: string;
}

/** Da oggi a domenica, con le stesse settimane della vista «Per settimana». */
function useSettimanaScadenzario() {
  const companyId = useEffectiveCompanyId();
  const oggi = new Date().toLocaleDateString("en-CA");
  const { data } = useQuery({
    queryKey: [...queryKeys.scadenzario.all, "settimana", companyId, oggi],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: righe, error } = await supabase.from("scadenze").select("direction, amount, paid_amount")
        .eq("company_id", companyId!).in("status", ["da_pagare", "parziale"])
        .gte("due_date", oggi).lte("due_date", domenicaDi(oggi)).limit(1000);
      if (error) throw error;
      const somma = (verso: string) => (righe ?? []).filter((r) => r.direction === verso)
        .reduce((t, r) => t + Number(r.amount ?? 0) - Number(r.paid_amount ?? 0), 0);
      return { incassare: somma("entrata"), pagare: somma("uscita") };
    },
  });
  return data;
}

export default function ScadenzarioKPIs({ summary, isLoading, className }: Props) {
  // I due versi separati arrivano dalla RPC. Se una risposta vecchia non li
  // porta ancora, si ricade sul totale: meglio il numero di prima che nessuno.
  const settimana = useSettimanaScadenzario();
  const scadutoEntrata = summary?.scadute_entrata_amount ?? summary?.scadute_amount ?? 0;
  const scadutoUscita = summary?.scadute_uscita_amount ?? 0;
  const entrataCount = summary?.scadute_entrata_count ?? summary?.scadute_count ?? 0;

  if (isLoading || !summary) {
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-slate-200 shadow-sm", className)}>
        <div className="bg-eic-navy-deep p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-white/12 bg-white/9" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const saldoNetto = summary.entrate_previste - summary.uscite_previste;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200 shadow-sm", className)}>
      {/* Senza il titoletto «Scadenzario — Cosa entra, cosa esce, quando»:
          ripeteva il titolo della pagina subito sopra. */}
      <div className="bg-eic-navy-deep p-4 text-white sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {/* Prima questa scheda mostrava "Scadute" sommando quello che i
              clienti devono all'azienda con quello che l'azienda deve ai
              fornitori: un numero che non e' il credito, non e' il debito e non
              e' il saldo, ma era il piu' grande della pagina. Ora il numero
              grosso e' il credito scaduto — la cosa su cui si puo' agire — e il
              debito scaduto sta nella riga sotto, dichiarato. */}
          <NavyStatCard
            label="Scaduto da incassare"
            value={fmtEur(scadutoEntrata)}
            sub={
              scadutoUscita > 0
                ? `${entrataCount} scadenz${entrataCount === 1 ? "a" : "e"} · e ${fmtEur(scadutoUscita)} da pagare`
                : `${entrataCount} scadenz${entrataCount === 1 ? "a" : "e"}`
            }
            icon={AlertTriangle}
            tone={entrataCount > 0 ? "text-orange-300" : "text-emerald-200"}
          />
          <NavyStatCard
            // Prima sommava incassi e pagamenti in un numero solo, che non diceva né l'uno né l'altro.
            label="Da incassare questa settimana"
            value={settimana ? fmtEur(settimana.incassare) : "—"}
            sub={settimana ? `e ${fmtEur(settimana.pagare)} da pagare` : "Non caricato"}
            icon={CalendarClock}
            tone="text-amber-200"
          />
          <NavyStatCard
            label="Prossimi 30gg"
            value={fmtEur(summary.prossimi_30gg_amount)}
            sub={`${summary.prossimi_30gg_count} scadenz${summary.prossimi_30gg_count === 1 ? "a" : "e"}`}
            icon={Clock}
          />
          <NavyStatCard
            label="Saldo netto atteso"
            value={fmtEur(saldoNetto)}
            sub={`entrate ${fmtEur(summary.entrate_previste)} · uscite ${fmtEur(summary.uscite_previste)}`}
            icon={saldoNetto >= 0 ? TrendingUp : TrendingDown}
            tone={saldoNetto >= 0 ? "text-emerald-200" : "text-rose-300"}
          />
        </div>
      </div>
    </div>
  );
}
