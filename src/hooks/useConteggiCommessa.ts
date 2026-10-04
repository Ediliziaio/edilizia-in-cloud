import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ConteggiCommessa {
  lavorazioni: number | null;
  rapportini: number | null;
  verbali: number | null;
  ordiniAcquisto: number | null;
}

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * I numeri accanto alle sotto-schede della commessa («Diario 16»): servono a
 * capire dove c'è materiale prima di aprire la vista.
 *
 * UNA sola richiesta (funzione `ordine_conteggi_viste`), non una per tabella:
 * all'apertura della commessa le prime richieste a partire sono quelle che
 * servono per vedere la pagina, e su telefono ogni richiesta in più le rallenta.
 * `abilitato` la fa partire solo a commessa caricata. Se fallisce, i numeri
 * semplicemente non compaiono: un contatore non deve rompere la pagina.
 */
export function useConteggiCommessa(orderId: string | undefined, companyId: string | undefined, abilitato = true) {
  return useQuery<ConteggiCommessa>({
    // chiave propria: nessuna delle liste vere usa questa forma
    queryKey: ["order-conteggi-viste", orderId, companyId],
    enabled: !!orderId && !!companyId && abilitato,
    staleTime: 30_000,
    queryFn: async () => {
      // La funzione non è ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ordine_conteggi_viste", { p_order_id: orderId });
      const r = (error ? {} : data ?? {}) as Record<string, unknown>;
      return {
        lavorazioni: numero(r.lavorazioni),
        rapportini: numero(r.rapportini),
        verbali: numero(r.verbali),
        ordiniAcquisto: numero(r.ordini_acquisto),
      };
    },
  });
}
