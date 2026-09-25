import { AlertTriangle, CalendarClock, CalendarDays, Clock, TrendingDown, TrendingUp } from "lucide-react";
import type { ScadenzarioSummary } from "@/hooks/useScadenzario";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { cn } from "@/lib/utils";

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

export default function ScadenzarioKPIs({ summary, isLoading, className }: Props) {
  // I due versi separati arrivano dalla RPC. Se una risposta vecchia non li
  // porta ancora, si ricade sul totale: meglio il numero di prima che nessuno.
  const scadutoEntrata = summary?.scadute_entrata_amount ?? summary?.scadute_amount ?? 0;
  const scadutoUscita = summary?.scadute_uscita_amount ?? 0;
  const entrataCount = summary?.scadute_entrata_count ?? summary?.scadute_count ?? 0;

  if (isLoading || !summary) {
    return (
      <div className={cn("overflow-hidden rounded-2xl border border-slate-200 shadow-sm", className)}>
        <div className="bg-[#173b67] p-4 sm:p-5">
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
      <div className="bg-[#173b67] p-4 text-white sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">Scadenzario</p>
            <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">Cosa entra, cosa esce, quando</h2>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
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
            label="Questa settimana"
            value={fmtEur(summary.questa_settimana_amount)}
            sub={`${summary.questa_settimana_count} scadenz${summary.questa_settimana_count === 1 ? "a" : "e"}`}
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
