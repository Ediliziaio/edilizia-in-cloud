// src/hooks/useAvanzamentoCantiere.ts
// Quanto è stato costruito davvero, per la generale e per le commesse dentro (16/11/2026).
//
// La testata mostrava l'avanzamento preso da `percentuale_avanzamento` delle commesse figlie.
// Su un'operazione immobiliare quelle figlie sono le unità in vendita («Unità 3», «Posto auto 7»):
// nessuno ci scrive una percentuale di lavori, e infatti è 0 ovunque nel database. I lavori si
// seguono dalle fasi di cantiere (order_work_phases), che è anche quello che mostra il riquadro
// Cantiere: la stessa lettura, così i due numeri non si contraddicono.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FaseCantiere {
  id: string;
  order_id: string;
  name: string;
  status: string;
  percentuale: number;
  start_date: string | null;
  end_date: string | null;
}

export const faseFinita = (f: FaseCantiere) => f.status === "completata" || f.percentuale >= 100;
export const faseInCorso = (f: FaseCantiere) => !faseFinita(f) && (f.status === "in_corso" || f.percentuale > 0);

/** La media delle fasi, 0-100. Null senza fasi: non è «0% fatto», è «non lo sappiamo». */
export function avanzamentoDalleFasi(fasi: readonly FaseCantiere[]): number | null {
  if (fasi.length === 0) return null;
  return Math.round(fasi.reduce((t, f) => t + Math.min(100, f.percentuale), 0) / fasi.length);
}

/**
 * Le fasi della generale e di tutte le commesse dentro. `generaleId` e `figlieIds` sono quelli
 * del riepilogo; la chiave è condivisa col riquadro Cantiere, così la lettura è una sola.
 */
export function useFasiCantiere(generaleId: string | undefined, figlieIds: readonly string[], abilitato = true) {
  const ids = generaleId ? [generaleId, ...figlieIds] : [];
  return useQuery({
    queryKey: ["generale-cantiere-fasi", generaleId, ids.length],
    enabled: !!generaleId && abilitato,
    staleTime: 60_000,
    queryFn: async (): Promise<FaseCantiere[]> => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id, order_id, name, status, percentuale, start_date, end_date")
        .in("order_id", ids)
        .order("position")
        .limit(500);
      if (error) throw error;
      // Prima quelle della generale, nel loro ordine; poi quelle delle commesse.
      return ((data ?? []) as FaseCantiere[]).sort((a, b) => Number(a.order_id !== generaleId) - Number(b.order_id !== generaleId));
    },
  });
}

export interface AvanzamentoCantiere {
  /** 0-100, oppure null quando non c'è ancora niente da cui dedurlo. */
  percento: number | null;
  /** Quante fasi lo dicono (0 = nessuna fase di cantiere). */
  fasi: number;
}

/** L'avanzamento dei lavori di un'operazione, dalle fasi di cantiere. */
export function useAvanzamentoCantiere(generaleId: string | undefined, figlieIds: readonly string[], abilitato = true): AvanzamentoCantiere {
  const q = useFasiCantiere(generaleId, figlieIds, abilitato);
  const elenco = Array.isArray(q.data) ? q.data : [];
  return { percento: avanzamentoDalleFasi(elenco), fasi: elenco.length };
}
