/**
 * useMarketingDomainGate — verifica se l'azienda può fare email marketing.
 *
 * Policy piattaforma: campagne marketing consentite SOLO con almeno un
 * dominio email proprio verificato (Elastic Email SPF+DKIM) e attivo.
 * Stessa condizione del gate server-side (checkMarketingDomainGate) e di
 * resolveSender: la UI mostra il muro, il server resta l'autorità.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useMarketingDomainGate() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-domain-gate", companyId],
    enabled: Boolean(companyId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_email_domains")
        .select("id, domain")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .eq("ee_spf_verified", true)
        .eq("ee_dkim_verified", true)
        .limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });

  return {
    isLoading,
    allowed: (data ?? []).length > 0,
    verifiedDomain: data?.[0]?.domain ?? null,
  };
}
