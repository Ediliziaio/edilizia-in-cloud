// src/hooks/useGeneraleSubappalti.ts
// Subappalti sul contratto d'appalto: una lettura (generale_subappalti_elenco) e due scritture,
// il legame con altri ordini di lavoro e la soglia della quota subappaltata (migrazione
// 20281105120000). Contratti, SAL passivi e documenti si gestiscono nella scheda del subappaltatore.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { leggiSubappalti, type DatiSubappalti } from "@/lib/orders/generali/subappalti";

// RPC non ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaviSubappalti = {
  elenco: (generaleId: string | undefined) => ["generale-subappalti", generaleId] as const,
};

export function useSubappaltiGenerale(generaleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: chiaviSubappalti.elenco(generaleId),
    enabled: !!generaleId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DatiSubappalti> => {
      const { data, error } = await db.rpc("generale_subappalti_elenco", { p_generale_id: generaleId });
      if (error) throw error;
      return leggiSubappalti(data);
    },
  });
}

export function useCollegaSubappalto(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contrattoId, ordini }: { contrattoId: string; ordini: string[] }) => {
      const { error } = await db.rpc("generale_subappalto_collega", {
        p_generale_id: generaleId, p_contratto_id: contrattoId, p_order_ids: ordini,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: chiaviSubappalti.elenco(generaleId) }),
  });
}

export function useSogliaSubappalti(generaleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sogliaPct: number | null) => {
      const { error } = await db.rpc("generale_subappalti_soglia", { p_generale_id: generaleId, p_soglia_pct: sogliaPct });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: chiaviSubappalti.elenco(generaleId) }),
  });
}
