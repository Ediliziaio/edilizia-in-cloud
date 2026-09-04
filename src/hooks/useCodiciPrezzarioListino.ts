/**
 * Dai `listino_voce_id` di un computo al CODICE del prezzario da cui quelle
 * voci di listino sono state adottate.
 *
 * È il passaggio che rende certa la corrispondenza col prezzario regionale:
 * senza, si potrebbe solo cercare per descrizione e ogni confronto sarebbe una
 * somiglianza. `rst_listino_voci.codice` viene valorizzato da
 * `useAdottaPrezzario` proprio quando la voce arriva da un prezzario.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

/** Mappa listino_voce_id → codice prezzario (solo per le voci che ne hanno uno). */
export function useCodiciPrezzarioListino(listinoVoceIds: Array<string | null>): Record<string, string> {
  const companyId = useEffectiveCompanyId();
  const ids = [...new Set(listinoVoceIds.filter((x): x is string => !!x))].sort();

  const { data } = useQuery<Record<string, string>>({
    queryKey: ["codici-prezzario-listino", companyId, ids.join(",")],
    enabled: !!companyId && ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data: righe, error } = await supabase
        .from("rst_listino_voci")
        .select("id, codice")
        .eq("company_id", companyId!)
        .in("id", ids);
      if (error) throw new Error(error.message);
      const mappa: Record<string, string> = {};
      for (const r of (righe ?? []) as Array<{ id: string; codice: string | null }>) {
        if (r.codice) mappa[r.id] = r.codice;
      }
      return mappa;
    },
  });

  return data ?? {};
}
