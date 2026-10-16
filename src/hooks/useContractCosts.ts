import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { consolidateContractCosts, type ContractCostSnapshot } from "@/lib/orders/contractCosts";

export function useContractCosts(contractId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { canViewCosts, isLoading } = usePermissions();
  const allowed = canViewCosts && !isLoading;
  const qc = useQueryClient();
  const key = ["contract-costs", companyId, contractId];
  const query = useQuery({
    queryKey: key,
    enabled: allowed && !!companyId && !!contractId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("contract_cost_snapshot", {
        p_company_id: companyId, p_contract_id: contractId,
      });
      if (error) throw error;
      if (!data) throw new Error("Riepilogo dei costi non disponibile.");
      return consolidateContractCosts(data as ContractCostSnapshot, companyId!, contractId);
    },
  });
  // Cost edits can originate in materials, HR, procurement or direct expenses.
  // Refresh after a completed mutation; polling also picks up another user's work.
  useEffect(() => {
    if (!allowed || !companyId) return;
    return qc.getMutationCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "success") {
        void qc.invalidateQueries({ queryKey: ["contract-costs", companyId, contractId] });
      }
    });
  }, [allowed, companyId, contractId, qc]);
  return { ...query, allowed };
}
