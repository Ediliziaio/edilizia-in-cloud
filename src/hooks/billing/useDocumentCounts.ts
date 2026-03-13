import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";

export interface DocumentCounts {
  fatture: number;
  proforma: number;
  nota_credito: number;
  ddt: number;
  preventivo: number;
  annullate: number;
}

export function useDocumentCounts() {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["billing-doc-counts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documenti_fiscali" as never)
        .select("tipo, stato")
        .eq("company_id", companyId!);

      if (error) throw error;

      const counts: DocumentCounts = {
        fatture: 0,
        proforma: 0,
        nota_credito: 0,
        ddt: 0,
        preventivo: 0,
        annullate: 0,
      };

      for (const row of (data as unknown as { tipo: string; stato: string }[]) ?? []) {
        if (row.stato === "annullata") {
          counts.annullate++;
          continue;
        }
        if (row.tipo === "fattura" || row.tipo === "fattura_pa") counts.fatture++;
        else if (row.tipo === "proforma") counts.proforma++;
        else if (row.tipo === "nota_credito") counts.nota_credito++;
        else if (row.tipo === "ddt") counts.ddt++;
        else if (row.tipo === "preventivo") counts.preventivo++;
      }

      return counts;
    },
    staleTime: 30_000,
  });
}
