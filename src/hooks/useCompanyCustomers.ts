import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export const companyCustomersKeys = {
  byCompany: (companyId: string | null | undefined) =>
    ["company-customers", companyId] as const,
};

/**
 * Lista clienti aziendali risolta lato database.
 *
 * Non leggiamo `user_roles` dal browser: le RLS rendono quella tabella
 * volutamente incompleta per utenti non admin e in passato hanno svuotato
 * dropdown ordini/ticket/interventi.
 */
export function useCompanyCustomers(companyId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: companyCustomersKeys.byCompany(companyId),
    enabled: !!companyId && enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<CompanyCustomer[]> => {
      if (!companyId) return [];

      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, string>
      ) => Promise<RpcResult>;
      const { data, error } = await rpc("get_company_customers", {
        p_company_id: companyId,
      });

      if (!error && Array.isArray(data)) {
        return data as CompanyCustomer[];
      }

      // Fail closed: senza RPC server-side non possiamo distinguere in modo
      // affidabile clienti e staff dal browser, perché user_roles è protetto da RLS.
      throw new Error("Directory clienti non disponibile: applicare la migration get_company_customers.");
    },
  });
}
