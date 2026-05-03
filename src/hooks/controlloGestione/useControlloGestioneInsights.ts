/**
 * Hook orchestratore: aggrega CE/SP/Rating/BEP + storico rating + dati cantieri,
 * scadenzario, banche → costruisce uno Snapshot e lancia `runRules`.
 *
 * I campi non ancora disponibili (cantieri/scadenzario/cashflow_30gg/saldo_banche)
 * sono inizializzati a 0/[] in attesa di hook dedicati: la maggior parte delle
 * regole è basata su CE/SP/Rating/BEP che sono già pronti.
 */

import { useQuery } from "@tanstack/react-query";
import { useCEriclassificato, useBEP } from "./useCEriclassificato";
import { useStatoPatrimoniale, useRating } from "./useStatoPatrimoniale";
import { supabase } from "@/integrations/supabase/client";
import { runRules, type Insight, type RatingSnapshotRow, type Snapshot } from "@/lib/controlloGestione/interpreter";

function useRatingStorico(months = 12) {
  return useQuery({
    queryKey: ["cg", "rating-storico", months] as const,
    queryFn: async (): Promise<RatingSnapshotRow[]> => {
      const { data, error } = await supabase
        .from("cg_rating_snapshot")
        .select("data_snapshot, classe_rating, scoring_totale")
        .order("data_snapshot", { ascending: false })
        .limit(months);
      if (error) throw error;
      return (data ?? []) as RatingSnapshotRow[];
    },
    staleTime: 10 * 60_000,
  });
}

export function useControlloGestioneInsights(anno: number) {
  const ceCorr = useCEriclassificato(anno);
  const cePrec = useCEriclassificato(anno - 1);
  const sp = useStatoPatrimoniale(anno);
  const rating = useRating(anno);
  const storico = useRatingStorico(12);
  const bep = useBEP(anno);

  const ready = !!(ceCorr.data && sp.data && rating.data && bep.data);
  const isLoading = ceCorr.isLoading || sp.isLoading || rating.isLoading || bep.isLoading;
  const isError = ceCorr.isError || sp.isError || rating.isError || bep.isError;

  let insights: Insight[] = [];
  if (ready) {
    const snapshot: Snapshot = {
      ce_anno_corr: ceCorr.data!,
      ce_anno_prec: cePrec.data ?? null,
      sp: sp.data!,
      rating: rating.data!,
      rating_storico: storico.data ?? [],
      bep: bep.data!,
      cantieri_attivi: [],
      scadenzario: [],
      saldo_banche: 0,
      cashflow_30gg: 0,
    };
    insights = runRules(snapshot);
  }

  return { insights, isLoading, isError };
}
