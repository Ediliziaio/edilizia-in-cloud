import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import type { AnagraficaAzienda } from "@/types/fatturazione";

export function useAnagraficaAzienda() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: queryKeys.anagraficaAzienda.detail(companyId ?? undefined),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anagrafica_azienda" as never)
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as AnagraficaAzienda | null;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
