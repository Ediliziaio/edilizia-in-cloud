import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SedeCampo {
  id: string;
  nome: string | null;
}

/** Le sedi attive dell'azienda (magazzino, ufficio…): luoghi da cui si può iniziare la giornata. */
export function useCampoSedi() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  return useQuery<SedeCampo[]>({
    queryKey: ["campo-sedi", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_sedi")
        .select("id, nome")
        .eq("company_id", companyId!)
        .or("attiva.is.null,attiva.eq.true")
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SedeCampo[];
    },
  });
}
