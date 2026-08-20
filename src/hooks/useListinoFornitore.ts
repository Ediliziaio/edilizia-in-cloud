/**
 * useListinoFornitore — lettura dei prezzi d'acquisto di un fornitore.
 *
 * Le voci arrivano dai listini ATTIVI del fornitore e servono in due posti:
 * il tab Listino sulla scheda fornitore e il suggerimento prezzo sulle righe
 * degli ordini d'acquisto. La lettura e' tollerante: se le tabelle non sono
 * ancora attive (migration da applicare) si degrada a vuoto senza rompere
 * le pagine che la usano.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VoceListinoFornitore } from "@/lib/listino/listinoFornitore";

export function useVociListinoFornitore(supplierId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["listino-fornitore-voci", supplierId],
    queryFn: async (): Promise<VoceListinoFornitore[]> => {
      // `as any`: tabelle nuove (migration 20280201000000), non ancora nei
      // tipi generati — convenzione di progetto per le tabelle appena nate.
      const { data: listini, error } = await (supabase as any)
        .from("listini_fornitore")
        .select("id")
        .eq("supplier_id", supplierId)
        .eq("attivo", true);
      if (error) return [];
      const ids = (listini ?? []).map((l: { id: string }) => l.id);
      if (ids.length === 0) return [];
      const { data: voci, error: e2 } = await (supabase as any)
        .from("listino_fornitore_voci")
        .select("id, codice, descrizione, unita, prezzo, sconto_pct")
        .in("listino_id", ids)
        .order("sort_order");
      if (e2) return [];
      return (voci ?? []) as VoceListinoFornitore[];
    },
    enabled: !!supplierId,
    staleTime: 60_000,
  });

  return { voci: query.data ?? [], isLoading: query.isLoading };
}
