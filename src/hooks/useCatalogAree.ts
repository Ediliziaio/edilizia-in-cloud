import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import type { MacroListino } from "@/lib/listino/lineeListino";

/** Etichette del listino, senza caricare immagini, campi personalizzati o costi. */
export function useCatalogAree() {
  const companyId = useEffectiveCompanyId();
  return useQuery<MacroListino[]>({
    queryKey: ["catalog", "aree", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      loadCatalogPages<MacroListino>(
        (from, to) =>
          supabase
            .from("listino_macrocategorie")
            .select("id, nome, verticali_abilitati, tipologia, fv_categoria")
            .eq("company_id", companyId!)
            .order("id")
            .range(from, to)
            .abortSignal(signal) as unknown as PromiseLike<{
            data: MacroListino[] | null;
            error: { message: string } | null;
          }>,
      ),
  });
}
