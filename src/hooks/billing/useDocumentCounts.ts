import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface DocumentCounts {
  fatture: number;
  proforma: number;
  nota_credito: number;
  ddt: number;
  preventivo: number;
  /** Stato fiscale 'annullata' (non e' il cestino) */
  annullate: number;
  /** Documenti nel cestino (deleted_at valorizzato): e' cio' che la scheda mostra */
  cestinati: number;
}

export function useDocumentCounts() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["billing-doc-counts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_documenti_counts" as never,
        { p_company_id: companyId! } as never
      );

      if (error) throw error;

      const result = (typeof data === "string" ? JSON.parse(data) : data) as DocumentCounts;
      return result;
    },
    staleTime: 30_000,
  });
}
