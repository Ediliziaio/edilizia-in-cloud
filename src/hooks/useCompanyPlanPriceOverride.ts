import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PlanPriceOverrideRow {
  custom_plan_price_eur: number | null;
  override_expires_at: string | null;
  is_enabled: boolean | null;
}

/**
 * Prezzo piano personalizzato dell'azienda (company_billing_overrides,
 * service='plan'), gestito nel tab Billing. Panoramica e Abbonamento lo usano
 * per mostrare l'MRR REALE: prima mostravano sempre il listino, anche con un
 * deal a prezzo scontato attivo.
 *
 * Ritorna il prezzo custom solo se l'override è abilitato e non scaduto,
 * altrimenti null (→ si usa il listino).
 */
export function useCompanyPlanPriceOverride(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-plan-price-override", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("company_billing_overrides" as never)
        .select("custom_plan_price_eur, override_expires_at, is_enabled")
        .eq("company_id", companyId!)
        .eq("service" as never, "plan" as never)
        .maybeSingle<PlanPriceOverrideRow>();
      if (error || !data) return null;
      if (data.is_enabled === false) return null;
      if (data.override_expires_at && new Date(data.override_expires_at) < new Date()) return null;
      const price = data.custom_plan_price_eur;
      return typeof price === "number" && Number.isFinite(price) && price >= 0 ? price : null;
    },
  });
}
