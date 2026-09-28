/**
 * Prelievo di magazzino dall'app di cantiere.
 * Registra il prelievo via RPC prelievo_campo_registra: se l'azienda è in
 * modalità "libero" scarica subito (stato "consegnato"), altrimenti resta
 * "richiesto" finché l'ufficio non lo approva.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface RigaPrelievo {
  stock_item_id: string;
  name: string;
  quantita: number;
  unita?: string | null;
}

export interface PrelievoEsito {
  id: string;
  stato: "richiesto" | "consegnato" | "rifiutato";
}

export function usePrelievoRegistra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string | null; righe: RigaPrelievo[]; note?: string | null }): Promise<PrelievoEsito> => {
      const { data, error } = await supabase.rpc("prelievo_campo_registra" as never, {
        p_order_id: input.orderId,
        p_warehouse_id: null,
        p_righe: input.righe as never,
        p_note: input.note ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as PrelievoEsito;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campo-warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["campo-miei-prelievi"] });
    },
  });
}

interface PrelievoRow {
  id: string;
  data: string;
  stato: "richiesto" | "consegnato" | "rifiutato";
  righe: RigaPrelievo[];
  note: string | null;
  order_id: string | null;
}

/** I miei ultimi prelievi (per far vedere all'operaio cosa ha segnato). */
export function useMieiPrelievi(limit = 20) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campo-miei-prelievi", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<PrelievoRow[]> => {
      const { data, error } = await supabase
        .from("prelievi_campo")
        .select("id, data, stato, righe, note, order_id")
        .eq("operaio_id", user!.id)
        .order("data", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PrelievoRow[];
    },
  });
}
