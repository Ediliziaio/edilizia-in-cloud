import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";

export function useAnagraficheNative(search?: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: queryKeys.anagraficheNative.list(companyId ?? undefined, search),
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("anagrafiche_native" as never)
        .select("*")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("ragione_sociale", { ascending: true })
        .limit(100);

      if (search) {
        query = query.or(
          `ragione_sociale.ilike.%${search}%,partita_iva.ilike.%${search}%,codice_fiscale.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useAnagraficaNative(id: string | undefined) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: queryKeys.anagraficheNative.detail(id),
    enabled: !!id && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anagrafiche_native" as never)
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as Record<string, unknown>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
