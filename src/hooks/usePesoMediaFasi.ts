// src/hooks/usePesoMediaFasi.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioModello } from "@/hooks/useModelliFasi";
import { pesoMediaValido, type PesoMedia } from "@/lib/orders/avanzamentoCommessa";

// La colonna non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiavePesoMedia = (companyId: string | undefined) => ["peso-media-fasi", companyId] as const;

/** Come l'azienda pesa le fasi nella media della commessa. Senza scelta (o se la lettura fallisce): alla pari. */
export function usePesoMediaFasi() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chiavePesoMedia(companyId),
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<PesoMedia> => {
      try {
        const { data, error } = await db.from("company_fasi_settings").select("peso_media").eq("company_id", companyId!).maybeSingle();
        if (error) throw error;
        return pesoMediaValido(data?.peso_media);
      } catch {
        return "uguale";
      }
    },
  });

  const salva = useMutation({
    mutationFn: async (peso: PesoMedia) => {
      const { error } = await db.rpc("fasi_impostazioni_salva", { p_company_id: companyId, p_valori: { peso_media: peso } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto: le commesse si sono aggiornate");
      void qc.invalidateQueries({ queryKey: chiavePesoMedia(companyId) });
      // La percentuale delle commesse è cambiata nel database.
      void qc.invalidateQueries({ queryKey: ["order-avanzamento"] });
      void qc.invalidateQueries({ queryKey: ["order_work_phases"] });
    },
    onError: (e) => toast.error(messaggioModello(e)),
  });

  return { pesoMedia: query.data ?? "uguale", isLoading: query.isLoading, salva };
}
