import type { ScadenzarioSummary } from "@/hooks/useScadenzario";
import { NumeroVeloce } from "@/components/charts/grafici/NumeroVeloce";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { domenicaDi } from "@/lib/finance/incassiSettimanali";
import { useForecastLedger } from "@/hooks/useForecastLedger";
import { incassiScaduti } from "@/lib/finance/incassiScaduti";

// Nei KPI di testata niente centesimi: piu' leggibili, mai troncati
// (stessa scelta del riepilogo Commesse e dei Costi).
const fmtEur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);

interface Props {
  summary: ScadenzarioSummary | undefined;
  isLoading: boolean;
  /** Es. "max-sm:hidden": su telefono la pagina mostra due numeri suoi. */
  className?: string;
  /** Premere lo scaduto filtra l'elenco sulle scadute. */
  onScadute?: () => void;
  scaduteAttive?: boolean;
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

export default function ScadenzarioKPIs({ summary, isLoading, className, onScadute, scaduteAttive }: Props) {
  // I due versi separati arrivano dalla RPC. Se una risposta vecchia non li
  // porta ancora, si ricade sul totale: meglio il numero di prima che nessuno.
  const settimana = useSettimanaScadenzario();
  const scadutoEntrata = summary?.scadute_entrata_amount ?? summary?.scadute_amount ?? 0;
  const scadutoUscita = summary?.scadute_uscita_amount ?? 0;
  const entrataCount = summary?.scadute_entrata_count ?? summary?.scadute_count ?? 0;

  // Lo scaduto da incassare è uno solo in tutta l'app (08/11/2026): quello del Previsionale,
  // che mette insieme rate delle commesse, scadenze e fatture una volta sola. Questa pagina
  // elenca solo le scadenze dell'anno scelto: il loro scaduto resta scritto sotto, «di cui».
  // Prima qui c'era solo quello, e per Ke Bei Serramenti diceva 0 € contro 1,2 milioni.
  const previsionale = useForecastLedger();
  const scadutoTotale = previsionale.data
    ? incassiScaduti(previsionale.data.movements, previsionale.data.today).reduce((t, m) => t + m.cents, 0) / 100
    : null;

  if (isLoading || !summary) {
    return (
      <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", className)}>
        {[...Array(4)].map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-xl border bg-muted/40" />)}
      </div>
    );
  }

  const saldoNetto = summary.entrate_previste - summary.uscite_previste;

  // Riquadri chiari con l'entrata a cascata, come nelle fatture e in Prima nota (16/11/2026).
  // Il numero grosso dello scaduto è il credito scaduto — la cosa su cui si può agire — e il
  // debito scaduto sta nella nota, dichiarato (prima si sommavano i due, un numero senza senso).
  return (
    <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", className)}>
      <NumeroVeloce
        indice={0}
        etichetta="Scaduto da incassare"
        valore={scadutoTotale ?? scadutoEntrata}
        tono={entrataCount > 0 ? "cattivo" : "buono"}
        onClick={onScadute}
        attivo={scaduteAttive}
        nota={
          (scadutoTotale != null
            ? `di cui ${fmtEur(scadutoEntrata)} in ${entrataCount} scadenz${entrataCount === 1 ? "a" : "e"} qui`
            : `${entrataCount} scadenz${entrataCount === 1 ? "a" : "e"}`)
          + (scadutoUscita > 0 ? ` · ${fmtEur(scadutoUscita)} da pagare` : "")
        }
      />
      <NumeroVeloce
        indice={1}
        etichetta="Da incassare questa settimana"
        valore={settimana?.incassare}
        testo={settimana ? undefined : "—"}
        tono="attenzione"
        nota={settimana ? `e ${fmtEur(settimana.pagare)} da pagare` : "non caricato"}
      />
      <NumeroVeloce
        indice={2}
        etichetta="Prossimi 30 giorni"
        valore={summary.prossimi_30gg_amount}
        nota={`${summary.prossimi_30gg_count} scadenz${summary.prossimi_30gg_count === 1 ? "a" : "e"}`}
      />
      <NumeroVeloce
        indice={3}
        etichetta="Saldo netto atteso"
        valore={saldoNetto}
        tono={saldoNetto >= 0 ? "buono" : "cattivo"}
        nota={`entrate ${fmtEur(summary.entrate_previste)} · uscite ${fmtEur(summary.uscite_previste)}`}
      />
    </div>
  );
}
