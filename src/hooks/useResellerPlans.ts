import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ResellerPlan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
}

/**
 * Catalogo dei piani che il PRODUTTORE può assegnare ai rivenditori:
 *  - i "full plan" globali attivi (Starter/Pro/Enterprise), produttore_id = NULL;
 *  - più i piani AD HOC creati dal super admin per QUESTO produttore (produttore_id
 *    = la sua azienda), qualunque sia il loro is_full_plan.
 *
 * RLS: la SELECT su subscription_plans è consentita agli utenti autenticati; il
 * filtro produttore_id qui restringe alla vista corretta per il produttore.
 */
export function useResellerPlans() {
  const { effectiveCompany, profile } = useAuth();
  const produttoreId = effectiveCompany?.id ?? profile?.company_id ?? null;

  return useQuery({
    queryKey: ["reseller-plans", produttoreId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResellerPlan[]> => {
      // is_full_plan / produttore_id / position non sempre nei tipi generati → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      let q = sb
        .from("subscription_plans")
        .select("id, name, slug, price_monthly")
        .eq("is_active", true);
      if (produttoreId) {
        // Full plan globali OPPURE piani custom di questo produttore.
        q = q.or(`and(is_full_plan.eq.true,produttore_id.is.null),produttore_id.eq.${produttoreId}`);
      } else {
        q = q.eq("is_full_plan", true).is("produttore_id", null);
      }
      const { data, error } = await q.order("position", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ResellerPlan[];
    },
  });
}
