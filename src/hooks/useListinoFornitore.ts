/**
 * useListinoFornitore — lettura dei prezzi d'acquisto di un fornitore.
 *
 * Le voci arrivano dai listini attivi del fornitore, quelli in vigore e quelli
 * scaduti: un prezzo vecchio e' comunque un punto di partenza, e toglierlo
 * lascerebbe chi compra senza niente. Le voci dei listini scaduti portano con
 * se' `listinoScadutoIl`, cosi' chi le propone puo' dire che non sono
 * aggiornate; fra due voci uguali vince sempre quella in vigore.
 *
 * Restano fuori i listini non ancora in vigore: un accordo che parte il mese
 * prossimo non e' un prezzo vecchio, e' un prezzo che non vale ancora.
 *
 * La regola sta in `validitaListino`, la stessa che usa la scheda fornitore. La
 * lettura e' tollerante: se le tabelle non sono ancora attive (migration da
 * applicare) si degrada a vuoto senza rompere le pagine che la usano.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { preferisciVociInVigore, type VoceListinoFornitore } from "@/lib/listino/listinoFornitore";
import { statoListino } from "@/lib/listino/validitaListino";

export function useVociListinoFornitore(supplierId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["listino-fornitore-voci", supplierId],
    queryFn: async (): Promise<VoceListinoFornitore[]> => {
      // `as any`: tabelle nuove (migration 20280201000000), non ancora nei
      // tipi generati — convenzione di progetto per le tabelle appena nate.
      const { data: listini, error } = await (supabase as any)
        .from("listini_fornitore")
        .select("id, valido_dal, valido_al, attivo")
        .eq("supplier_id", supplierId)
        .eq("attivo", true);
      if (error) return [];
      const usabili = ((listini ?? []) as Array<{ id: string; valido_dal: string | null; valido_al: string | null; attivo: boolean }>)
        .map((l) => ({ id: l.id, stato: statoListino(l), scadutoIl: l.valido_al }))
        .filter((l) => l.stato === "in_vigore" || l.stato === "scaduto");
      if (usabili.length === 0) return [];
      const scadenzaDi = new Map(usabili.map((l) => [l.id, l.stato === "scaduto" ? l.scadutoIl : null]));
      const { data: voci, error: e2 } = await (supabase as any)
        .from("listino_fornitore_voci")
        .select("id, codice, descrizione, unita, prezzo, sconto_pct, listino_id")
        .in("listino_id", [...scadenzaDi.keys()])
        .order("sort_order");
      if (e2) return [];
      const conValidita = ((voci ?? []) as Array<VoceListinoFornitore & { listino_id: string }>)
        .map(({ listino_id, ...v }) => ({ ...v, listinoScadutoIl: scadenzaDi.get(listino_id) ?? null }));
      return preferisciVociInVigore(conValidita);
    },
    enabled: !!supplierId,
    staleTime: 60_000,
  });

  return { voci: query.data ?? [], isLoading: query.isLoading };
}
