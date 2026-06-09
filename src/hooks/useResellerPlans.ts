import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ResellerPlan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
}

/**
 * Catalogo dei piani che il PRODUTTORE può assegnare ai rivenditori: solo i
 * "full plan" attivi (Starter/Pro/Enterprise), ordinati per posizione. È lo
 * stesso insieme che il superadmin usa in "Cambia piano", ristretto ai piani
 * completi (gli add-on a consumo non sono un piano base sensato per un'azienda).
 *
 * RLS: la SELECT su subscription_plans è consentita agli utenti autenticati,
 * quindi il produttore può leggere il catalogo senza edge function dedicata.
 */
export function useResellerPlans() {
  return useQuery({
    queryKey: ["reseller-plans"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResellerPlan[]> => {
      // is_full_plan / position non sempre presenti nei tipi generati → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subscription_plans")
        .select("id, name, slug, price_monthly")
        .eq("is_active", true)
        .eq("is_full_plan", true)
        .order("position", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ResellerPlan[];
    },
  });
}
