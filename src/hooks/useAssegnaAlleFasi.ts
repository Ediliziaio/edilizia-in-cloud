// src/hooks/useAssegnaAlleFasi.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidaSquadreCollegate } from "@/lib/manodopera/cacheSquadre";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";

export interface ScelteAssegnazione {
  fasi: string[];
  squadre: string[];
  persone: string[];
  ditte: string[];
}

interface EsitoAssegnazione {
  squadre: number;
  persone: number;
  ditte: number;
  gia_assegnate: number;
}

/** «2 squadre, 1 ditta aggiunte · 3 c'erano già». */
export function testoEsitoAssegnazione(e: EsitoAssegnazione): string {
  const parti = [
    e.squadre ? `${e.squadre} ${e.squadre === 1 ? "squadra" : "squadre"}` : null,
    e.persone ? `${e.persone} ${e.persone === 1 ? "persona" : "persone"}` : null,
    e.ditte ? `${e.ditte} ${e.ditte === 1 ? "ditta" : "ditte"}` : null,
  ].filter(Boolean);
  const aggiunte = parti.length ? `Assegnate: ${parti.join(", ")}` : "Nessuna nuova assegnazione";
  return e.gia_assegnate ? `${aggiunte} · ${e.gia_assegnate} c'erano già` : aggiunte;
}

/** Una chiamata sola, tutto o niente: accessi, area campo e WhatsApp seguono dal database. */
export function useAssegnaAlleFasi(orderId: string) {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  return useMutation({
    mutationFn: async (s: ScelteAssegnazione): Promise<EsitoAssegnazione> => {
      const { data, error } = await supabase.rpc("assegna_alle_fasi" as never, {
        p_order_id: orderId, p_fasi: s.fasi, p_squadre: s.squadre, p_persone: s.persone, p_ditte: s.ditte,
      } as never);
      if (error) throw error;
      return data as unknown as EsitoAssegnazione;
    },
    onSuccess: (esito) => {
      toast.success(testoEsitoAssegnazione(esito));
      refreshWorkQueries(qc, orderId, companyId);
      void invalidaSquadreCollegate(qc);
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Assegnazione non riuscita: non è stato salvato niente."),
  });
}
