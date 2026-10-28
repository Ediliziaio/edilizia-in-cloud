import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { subcontractStatistics } from "@/lib/orders/subcontractStatistics";

/** No aggregate join between SAL and retentions: that join can multiply money. */
export function useOrderSubcontractStatistics(orderId: string) {
  const { effectiveCompany } = useAuth();
  const { canViewCosts, isLoading } = usePermissions();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["order-subcontract-statistics", orderId, companyId],
    enabled: !!companyId && !!orderId && !!canViewCosts && !isLoading,
    staleTime: 60_000,
    queryFn: async () => {
      const [contracts, sals] = await Promise.all([
        supabase.from("contratti_subappalto").select("id,importo_contrattuale,stato")
          .eq("company_id", companyId!).eq("order_id", orderId).limit(1000),
        supabase.from("sal_subappaltatori").select("id,contratto_id,importo_lordo,importo_netto,pagato_registrato,stato")
          .eq("company_id", companyId!).eq("order_id", orderId).limit(1000),
      ]);
      if (contracts.error) throw contracts.error;
      if (sals.error) throw sals.error;
      // Never silently publish a truncated sum, including server-side max_rows=1000.
      if ((contracts.data?.length ?? 0) >= 1000 || (sals.data?.length ?? 0) >= 1000) throw new Error("Troppi dati per il riepilogo: verifica i subappalti nella sezione dedicata.");
      return subcontractStatistics(contracts.data ?? [], sals.data ?? []);
    },
  });
}
