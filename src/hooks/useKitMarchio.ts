/**
 * Il kit del marchio dell'azienda (Brand & Azienda): il colore e il logo chiaro.
 *
 * I documenti lo ereditano quando il modello del modulo ha ancora il colore di
 * fabbrica: si sceglie una volta, vale ovunque. Qui lo legge l'anteprima di
 * copertina degli editor, per mostrare lo stesso colore che uscirà nel PDF.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface KitMarchio {
  coloreMarca: string | null;
  logoUrl: string | null;
  logoChiaroUrl: string | null;
}

export function useKitMarchio(): KitMarchio | null {
  const companyId = useEffectiveCompanyId();
  const { data } = useQuery<KitMarchio | null>({
    queryKey: ["kit-marchio", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: riga } = await supabase
        .from("companies")
        .select("brand_primary_color, logo_url, brand_logo_dark_url")
        .eq("id", companyId!)
        .maybeSingle();
      if (!riga) return null;
      return {
        coloreMarca: riga.brand_primary_color ?? null,
        logoUrl: riga.logo_url ?? null,
        logoChiaroUrl: riga.brand_logo_dark_url ?? null,
      };
    },
  });
  return data ?? null;
}
