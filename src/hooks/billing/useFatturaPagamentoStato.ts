import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FatturaPagamentoStato {
  fattura_id: string;
  company_id: string;
  importo_totale: number;
  importo_incassato: number;
  importo_residuo: number;
  stato_pagamento: "pagata" | "parziale" | "in_attesa" | "scaduta";
  ultimo_incasso: string | null;
  numero_incassi: number;
}

export function useFatturaPagamentoStato(fatturaId: string | undefined) {
  return useQuery({
    queryKey: ["fattura-pagamento-stato", fatturaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fattura_pagamento_stato" as never)
        .select("*")
        .eq("fattura_id", fatturaId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FatturaPagamentoStato | null;
    },
    enabled: !!fatturaId,
  });
}
