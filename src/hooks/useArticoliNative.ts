import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import type { ArticoloNative } from "@/types/fatturazione";

export function useArticoliNative(search?: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: queryKeys.articoliNative.list(companyId ?? undefined, search),
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("articoli_native" as never)
        .select("*")
        .eq("company_id", companyId!)
        .eq("attivo", true)
        .order("descrizione", { ascending: true })
        .limit(200);

      if (search) {
        query = query.or(
          `descrizione.ilike.%${search}%,codice.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data as unknown[]) ?? []) as unknown as ArticoloNative[];
    },
  });
}
