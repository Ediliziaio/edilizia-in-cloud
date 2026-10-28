import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "./useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { FontiMezzi } from "@/lib/mezzi/economiaPiani";
// Nuove RPC, payload validati dal database.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export interface PersonaRisorsa {
  id: string;
  nome: string;
  in_cantiere: boolean;
  capocantiere: boolean;
}
export function usePersonePianoMezzi(orderId: string, enabled: boolean) {
  const c = useEffectiveCompanyId();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mezzi-piano-persone", c, orderId, user?.id],
    enabled: enabled && !!c,
    queryFn: async (): Promise<PersonaRisorsa[]> => {
      const { data, error } = await db.rpc("mezzi_piano_persone", {
        p_order_id: orderId,
      });
      if (error) throw error;
      return data;
    },
  });
}
export function useMezziPianoEconomia(orderId: string, enabled: boolean) {
  const c = useEffectiveCompanyId();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fonti = useQuery({
    queryKey: ["mezzi-piano-fonti", c, orderId, user?.id],
    enabled: enabled && !!c,
    staleTime: 0,
    refetchInterval: 30000,
    queryFn: async (): Promise<FontiMezzi> => {
      const { data, error } = await db.rpc("mezzi_piano_fonti", {
        p_order_id: orderId,
      });
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (enabled && fonti.data)
      void qc.invalidateQueries({
        queryKey: ["order-economics-canonical", orderId],
      });
  }, [fonti.data, enabled, qc, orderId]);
  const collega = useMutation({
    mutationFn: async (input: {
      pianoId: string;
      tipo: "costo" | "oda";
      fonteId: string;
      importo: number | null;
    }) => {
      const { error } = await db.rpc("collega_spesa_piano_mezzo", {
        p_piano_id: input.pianoId,
        p_tipo: input.tipo,
        p_fonte_id: input.fonteId,
        p_importo: input.importo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["mezzi-piano-fonti", c, orderId],
      });
      void qc.invalidateQueries({
        queryKey: ["order-economics-canonical", orderId],
      });
      toast.success("Collegamento aggiornato. Nessun costo duplicato.");
    },
    onError: (e: { message?: string }) =>
      toast.error(e.message || "Collegamento non salvato"),
  });
  return { fonti, collega };
}
