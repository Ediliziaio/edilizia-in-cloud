import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { contractWorkflowProfile } from "@/lib/orders/contractPreparation";

/** Opt-in aziendale: nessun nome, settore o contenuto del PDF abilita il profilo. */
export function useContractWorkflowProfile() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["contract-workflow-profile", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      // Colonna nuova, non ancora presente nei tipi generati.
      const { data, error } = await (supabase as any).from("company_fasi_settings")
        .select("contract_workflow_profile").eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      return contractWorkflowProfile(data?.contract_workflow_profile);
    },
  });
}
