import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Chi apre l'app del cantiere è dell'ufficio? Lo dice il database
 * (`campo_e_ufficio`), la stessa regola che `ddt_documento_accoda` usa per
 * accettare una bolla senza commessa. Finché non risponde — o se sbaglia — vale
 * la regola degli operai: è il lato prudente.
 */
export function useCampoUfficio() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ["campo-e-ufficio", companyId, user?.id],
    enabled: !!user?.id && !!companyId,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_e_ufficio", {
        p_company_id: companyId!,
      });
      if (error) throw error;
      return data === true;
    },
  });
}
