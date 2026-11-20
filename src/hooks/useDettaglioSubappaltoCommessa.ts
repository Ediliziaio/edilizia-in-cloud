import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import type { QuadroFlusso, VarianteFlusso } from "@/lib/subappaltatori/flussoCommessa";
import type { SALSubappaltatore } from "@/types/subappaltatori";

// Tabelle recenti non ancora presenti nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveFlussoSubappalto = (companyId: string, orderId: string, contrattoId?: string) =>
  contrattoId ? ["subappalto-flusso", companyId, orderId, contrattoId] as const : ["subappalto-flusso", companyId, orderId] as const;

export function useDettaglioSubappaltoCommessa(companyId: string, orderId: string, contrattoId: string, abilitato: boolean) {
  return useQuery({
    queryKey: chiaveFlussoSubappalto(companyId, orderId, contrattoId),
    enabled: abilitato && !!companyId && !!orderId && !!contrattoId,
    staleTime: 15_000,
    queryFn: async () => {
      const [quadro, varianti, sal] = await Promise.all([
        db.from("subappalto_quadri_lavori").select("id,revisione,voci,importo_lavori").eq("company_id", companyId)
          .eq("contratto_id", contrattoId).order("revisione", { ascending: false }).limit(1),
        tutteLePagine<VarianteFlusso>((from, to) => db.from("subappalto_varianti_contratto")
          .select("id,importo_prima,importo_dopo,oneri_prima,oneri_dopo,motivo,created_at").eq("company_id", companyId)
          .eq("contratto_id", contrattoId).order("created_at", { ascending: false }).order("id").range(from, to)),
        tutteLePagine<SALSubappaltatore>((from, to) => db.from("sal_subappaltatori")
          .select("id,company_id,contratto_id,subappaltatore_id,order_id,numero_sal,data_emissione,importo_lordo,ritenuta_pct,ritenuta_importo,importo_netto,stato,data_pagamento,payment_method,payment_reference,note,attachment_url,created_at,pagato_registrato")
          .eq("company_id", companyId).eq("order_id", orderId).eq("contratto_id", contrattoId)
          .order("numero_sal", { ascending: false }).order("id").range(from, to)),
      ]);
      if (quadro.error) throw quadro.error;
      if (quadro.data?.[0] && !Array.isArray(quadro.data[0].voci)) throw new Error("Il quadro lavori non si legge. Apri le condizioni del contratto per verificarlo.");
      return { quadro: (quadro.data?.[0] ?? null) as QuadroFlusso | null, varianti, sal };
    },
  });
}
