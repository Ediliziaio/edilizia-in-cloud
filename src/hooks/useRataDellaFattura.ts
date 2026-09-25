// La rata della commessa che una fattura interna incassa (25/09/2026): pagata
// l'una, pagata l'altra (order_installments.documento_fiscale_id e i trigger
// allinea_* nel database). Serve al dettaglio della fattura per mostrarla.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface RataDellaFattura {
  id: string;
  label: string;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  commessa: { id: string; order_code: string | null; description: string | null } | null;
}

export function useRataDellaFattura(documentoId: string | undefined) {
  return useQuery({
    // Sotto la chiave del documento: «Segna pagata» e l'invio la rinfrescano.
    queryKey: [...queryKeys.documentiFiscali.detail(documentoId), "rata-commessa"],
    enabled: !!documentoId,
    queryFn: async (): Promise<RataDellaFattura | null> => {
      const { data, error } = await supabase
        .from("order_installments" as never)
        .select("id, label, amount, is_paid, paid_date, commessa:orders(id, order_code, description)")
        .eq("documento_fiscale_id", documentoId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as RataDellaFattura | null) ?? null;
    },
    staleTime: 60_000,
  });
}
