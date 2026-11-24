import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useCostiMaterialiFasi } from "@/hooks/useCostiMaterialiFasi";
import { useCostiDirettiFasi } from "@/hooks/useCostiDirettiFasi";
import { posaPerFaseDi } from "@/lib/distinta/consumiMateriali";
import { ripartisciCostiDiretti } from "@/lib/orders/costiDirettiFasi";
import { economiaFasi } from "@/lib/orders/economiaFasi";
import { leggiEconomiaCommesse } from "@/lib/economiaCommesse";
import { confrontoPrevistoReale, previsioneSalvata, type RapportinoGiorni } from "@/lib/planimetrie/previstoReale";

/**
 * La previsione dei lavori salvata con la commessa (24/11/2026) e il confronto col reale.
 * Tutto dietro il permesso sui costi: la tabella lo chiede già (puo_vedere_costi), qui si
 * evita di chiedere a chi non lo ha.
 */
const COLONNE = "id, created_at, variante_nome, versione, totale, giorni_lavoro, giorni_calendario, extra_accesi, previsione, versione_regole, planimetria_id, variante_id";

export const chiavePrevisioneCommessa = (orderId: string | null | undefined) => ["commessa-previsione-lavori", orderId] as const;

export function useUltimaPrevisioneCommessa(orderId: string | null | undefined, abilitato: boolean) {
  return useQuery({
    queryKey: chiavePrevisioneCommessa(orderId),
    enabled: !!orderId && abilitato,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("commessa_previsioni_lavori").select(COLONNE)
        .eq("order_id", orderId!).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSalvaPrevisioneCommessa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (riga: TablesInsert<"commessa_previsioni_lavori">) => {
      const { data, error } = await supabase.from("commessa_previsioni_lavori").insert(riga).select("id, created_at").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, riga) => { void qc.invalidateQueries({ queryKey: chiavePrevisioneCommessa(riga.order_id) }); },
  });
}

/** Previsione salvata accanto a costo e durata veri della commessa. */
export function usePrevistoReale(orderId: string, abilitato: boolean, date: { inizio: string | null; fine: string | null }) {
  const salvata = useUltimaPrevisioneCommessa(orderId, abilitato);
  const previsione = previsioneSalvata(salvata.data?.previsione);
  const attivo = abilitato && !!previsione;
  // Stesse query (e cache) della scheda Lavorazioni: il costo vero per fase è il suo.
  const { phases, materials, allAssignments, isLoading: fasiInCarico, isError: fasiErrore } = useOrderWorkPhases(attivo ? orderId : undefined);
  const costiMateriali = useCostiMaterialiFasi(orderId, attivo);
  const costiDiretti = useCostiDirettiFasi(orderId, attivo);
  const totale = useQuery({
    queryKey: ["previsto-reale-economia", orderId],
    enabled: attivo,
    staleTime: 2 * 60_000,
    queryFn: async ({ signal }) => (await leggiEconomiaCommesse<{ consuntivo: number | null; costo_manodopera: number | null }>([orderId], { signal, colonne: "consuntivo, costo_manodopera" }))[0] ?? null,
  });
  const rapportini = useQuery({
    queryKey: ["previsto-reale-rapportini", orderId],
    enabled: attivo,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<RapportinoGiorni[]> => {
      const { data, error } = await supabase.from("campo_rapportini").select("data_lavoro, fasi_lavorate")
        .eq("order_id", orderId).is("annullato_at", null).neq("stato", "rifiutato").limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const confronto = useMemo(() => {
    if (!previsione) return null;
    const pronto = !fasiInCarico && !fasiErrore && !!costiMateriali.data && !costiDiretti.isPending;
    let costoPerFase: Map<string, number> | null = null;
    if (pronto) {
      const quote = costiDiretti.data?.costi ? ripartisciCostiDiretti({ costi: costiDiretti.data.costi, fasi: phases, ditte: costiDiretti.data.ditte, contratti: costiDiretti.data.contratti }) : [];
      const e = economiaFasi({
        fasi: phases, righe: materials, assegnazioni: allAssignments,
        acquisti: costiMateriali.data?.acquisti, movimenti: costiMateriali.data?.movimenti,
        posaPerFase: posaPerFaseDi(costiMateriali.data?.rapportini, materials), costiDiretti: quote,
      });
      costoPerFase = new Map([...e.perFase].map(([id, f]) => [id, f.costoConsuntivo]));
    }
    return confrontoPrevistoReale({
      previsione, fasiCommessa: phases, costoPerFase,
      totaleReale: totale.data ? { consuntivo: totale.data.consuntivo, manodopera: totale.data.costo_manodopera } : null,
      rapportini: rapportini.data ?? null, inizioLavori: date.inizio, fineLavori: date.fine,
    });
  }, [previsione, phases, materials, allAssignments, fasiInCarico, fasiErrore, costiMateriali.data, costiDiretti.data, costiDiretti.isPending, totale.data, rapportini.data, date.inizio, date.fine]);
  return {
    salvata: salvata.data ?? null,
    confronto,
    isLoading: salvata.isLoading || (attivo && (fasiInCarico || totale.isLoading || rapportini.isLoading)),
    isError: salvata.isError,
  };
}
