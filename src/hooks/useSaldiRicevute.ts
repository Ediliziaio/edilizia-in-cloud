import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";

export interface SaldoRicevuta {
  id: string;
  dovuto: number | null;
  pagato: number | null;
  residuo: number | null;
  iva_split: number;
  pagata_il: string | null;
  data_saldo: string | null;
  rate_pagate: number;
  rate_totali: number;
  stornata: boolean;
}

export function useSaldiRicevute(companyId: string | null | undefined, anno: string) {
  return useQuery({
    // Lo stesso prefisso del dettaglio aggiorna la lista quando cambiano rate e pagamenti.
    queryKey: ["fatture-ricevute-pagamento", "saldi", companyId, anno],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const righe = await tutteLePagine<SaldoRicevuta>((from, to) => supabase
        .rpc("fatture_ricevute_saldi" as never, {
          p_company_id: companyId!, p_anno: anno === "all" ? null : Number(anno),
        } as never)
        .order("id").range(from, to) as unknown as PromiseLike<{ data: SaldoRicevuta[] | null; error: unknown }>);
      return new Map(righe.map(saldo => [saldo.id, saldo]));
    },
  });
}
