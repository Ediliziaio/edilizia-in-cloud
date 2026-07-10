/**
 * Hook orchestratore: aggrega CE/SP/Rating/BEP + storico rating + dati cantieri,
 * scadenzario, banche → costruisce uno Snapshot e lancia `runRules`.
 *
 * Cantieri (marginalità commesse), scadenzario, saldo banche e proiezione 30gg
 * sono cablati su dati reali: se le query secondarie sono ancora in volo le
 * regole partono comunque su CE/SP/Rating/BEP e si arricchiscono al loro arrivo.
 */

import { useQuery } from "@tanstack/react-query";
import { useCEriclassificato, useBEP } from "./useCEriclassificato";
import { useStatoPatrimoniale, useRating } from "./useStatoPatrimoniale";
import { useMarginalitaCommesse } from "./useMarginalitaCommesse";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import {
  runRules,
  type CantiereLite,
  type Insight,
  type RatingSnapshotRow,
  type ScadenzaLite,
  type Snapshot,
} from "@/lib/controlloGestione/interpreter";

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

interface SnapshotOperativo {
  saldo_banche: number;
  scadenzario: ScadenzaLite[];
  cashflow_30gg: number;
}

/**
 * Dati operativi per le regole cassa/crediti: saldo banche attive, scadenze
 * aperte (scadute + prossimi 30gg) e proiezione di cassa a 30 giorni
 * (saldo + entrate attese − uscite dovute nel periodo, incluse le scadute).
 */
function useSnapshotOperativo() {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cg", "insights-operativo", companyId] as const,
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SnapshotOperativo> => {
      const today = new Date();
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      const in30Str = in30.toLocaleDateString("en-CA"); // data locale, no drift UTC

      const [banks, aperte] = await Promise.all([
        supabase
          .from("bank_accounts")
          .select("current_balance")
          .eq("company_id", companyId!)
          .eq("is_active", true),
        supabase
          .from("scadenze")
          .select("id, direction, description, amount, paid_amount, due_date")
          .eq("company_id", companyId!)
          .in("status", ["da_pagare", "parziale"])
          .lte("due_date", in30Str)
          .limit(1000),
      ]);
      if (banks.error) throw banks.error;
      if (aperte.error) throw aperte.error;

      const saldo_banche = (banks.data ?? []).reduce(
        (s, b) => s + Number(b.current_balance ?? 0),
        0,
      );

      const MS_DAY = 86_400_000;
      const scadenzario: ScadenzaLite[] = [];
      let netto30 = 0;
      for (const r of aperte.data ?? []) {
        const residuo = Number(r.amount ?? 0) - Number(r.paid_amount ?? 0);
        if (residuo <= 0 || !r.due_date) continue;
        // giorni_scadenza > 0 = scaduta da N giorni (la regola crediti filtra > 60)
        const giorni = Math.floor(
          (today.getTime() - new Date(`${r.due_date}T00:00:00`).getTime()) / MS_DAY,
        );
        scadenzario.push({
          id: r.id,
          tipo: r.direction === "entrata" ? "cliente" : "fornitore",
          cliente_nome: r.description ?? undefined,
          importo: residuo,
          giorni_scadenza: giorni,
        });
        netto30 += r.direction === "entrata" ? residuo : -residuo;
      }

      return { saldo_banche, scadenzario, cashflow_30gg: saldo_banche + netto30 };
    },
  });
}

export function useControlloGestioneInsights(anno: number) {
  const ceCorr = useCEriclassificato(anno);
  const cePrec = useCEriclassificato(anno - 1);
  const sp = useStatoPatrimoniale(anno);
  const rating = useRating(anno);
  const storico = useRatingStorico(12);
  const bep = useBEP(anno);
  const commesse = useMarginalitaCommesse(anno);
  const operativo = useSnapshotOperativo();

  const ready = !!(ceCorr.data && sp.data && rating.data && bep.data);
  const isLoading = ceCorr.isLoading || sp.isLoading || rating.isLoading || bep.isLoading;
  const isError = ceCorr.isError || sp.isError || rating.isError || bep.isError;

  let insights: Insight[] = [];
  if (ready) {
    // Cantieri "attivi" = non completati, con un margine valutabile: il margine
    // atteso a fine lavori se proiettabile, altrimenti quello corrente.
    const cantieri: CantiereLite[] = (commesse.data?.righe ?? [])
      .filter((r) => r.pct_avanzamento < 1)
      .map((r) => ({
        id: r.id,
        nome: r.order_code ? `${r.order_code} ${r.description}` : r.description,
        margine_pct: r.margine_atteso_perc ?? (r.margine_perc || null),
        margine_eur: r.margine_atteso ?? (r.margine || null),
      }));

    const snapshot: Snapshot = {
      ce_anno_corr: ceCorr.data!,
      ce_anno_prec: cePrec.data ?? null,
      sp: sp.data!,
      rating: rating.data!,
      rating_storico: storico.data ?? [],
      bep: bep.data!,
      cantieri_attivi: cantieri,
      scadenzario: operativo.data?.scadenzario ?? [],
      saldo_banche: operativo.data?.saldo_banche ?? 0,
      // Senza dati operativi la regola liquidità non deve scattare a vuoto → 0.
      cashflow_30gg: operativo.data?.cashflow_30gg ?? 0,
    };
    insights = runRules(snapshot);
  }

  return { insights, isLoading, isError };
}
