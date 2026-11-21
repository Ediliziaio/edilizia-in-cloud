import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { statoListino } from "@/lib/listino/validitaListino";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { offertaDaListino } from "@/lib/serramenti/fornitureConfigurazione";
import type { Json } from "@/integrations/supabase/types";

type Riga = Parameters<typeof offertaDaListino>[0] & {
  configurazione_serramento: Json;
  listino: Parameters<typeof offertaDaListino>[0]["listino"] & {
    attivo: boolean;
    valido_dal: string | null;
    valido_al: string | null;
  };
};

export function useOfferteSerramento(companyId: string | null | undefined, tipologia: string | null | undefined) {
  return useQuery({
    queryKey: ["offerte-configurazione-serramento", companyId, tipologia],
    enabled: !!companyId && !!tipologia,
    queryFn: async () => {
      const righe = await loadCatalogPages<Riga>(async (from, to) => {
        const { data, error } = await supabase.from("listino_fornitore_voci")
          .select("id,codice,unita,prezzo,sconto_pct,configurazione_serramento,listino:listini_fornitore!inner(supplier_id,nome,attivo,valido_dal,valido_al,fornitore:suppliers!inner(name))")
          .eq("company_id", companyId!)
          .eq("configurazione_serramento->>tipologia", tipologia!)
          .eq("listino.attivo", true)
          .eq("listino.fornitore.is_active", true)
          .order("id")
          .range(from, to);
        // Il database può ricevere la migrazione dopo il frontend.
        if (error?.code === "42703" || error?.code === "PGRST204") return { data: [], error: null };
        return { data: data as unknown as Riga[] | null, error };
      });
      return righe.flatMap((riga) => {
        if (statoListino(riga.listino) !== "in_vigore") return [];
        const offerta = offertaDaListino(riga);
        return offerta ? [offerta] : [];
      }).sort((a, b) => a.fornitore.localeCompare(b.fornitore, "it") || a.codice.localeCompare(b.codice, "it"));
    },
    staleTime: 30_000,
  });
}
