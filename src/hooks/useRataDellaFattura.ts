import { applicaQuoteAlleRate, type QuotaFatturaRata } from "@/lib/orders/quoteFatturaRate";
import type { Installment } from "@/lib/orderUtils";
// La rata della commessa che una fattura interna incassa (25/09/2026): pagata
// l'una, pagata l'altra (order_installments.documento_fiscale_id e i trigger
// allinea_* nel database). Serve al dettaglio della fattura per mostrarla.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface RataDellaFattura extends Installment {
  id: string;
  label: string;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  commessa: { id: string; order_code: string | null; description: string | null } | null;
}

export function useRateDellaFattura(documentoId: string | undefined) {
  return useQuery({
    // Sotto la chiave del documento: «Segna pagata» e l'invio la rinfrescano.
    queryKey: [...queryKeys.documentiFiscali.detail(documentoId), "rate-commessa"],
    enabled: !!documentoId,
    queryFn: async (): Promise<RataDellaFattura[]> => {
      const { data, error } = await supabase
        .from("order_installments" as never)
        .select("*, fattura:documenti_fiscali(id,numero,stato,importo_pagato), commessa:orders(id, order_code, description)")
        .eq("documento_fiscale_id", documentoId!)
        .order("position");
      if (error) throw error;
      const rate=(data??[]) as unknown as RataDellaFattura[];
      if(!rate.some(r=>r.documento_quota_lorda!=null))return rate;
      const orderId=rate[0]?.commessa?.id;
      if(!orderId)throw new Error("Commessa della fattura non disponibile");
      const q=await supabase.rpc('rate_fattura_quote' as never,{p_order_id:orderId} as never);
      if(q.error)throw q.error;
      return applicaQuoteAlleRate(rate,(q.data??[]) as unknown as QuotaFatturaRata[]);
    },
    staleTime: 60_000,
  });
}

/** Compatibilità per i lettori che richiedono solo la prima rata. */
export function useRataDellaFattura(id:string|undefined){ const q=useRateDellaFattura(id);return {...q,data:q.data?.[0]??null}; }
