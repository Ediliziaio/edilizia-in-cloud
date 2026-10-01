/**
 * Gli interventi che devo fare (26/09/2026): assistenza e manutenzione
 * assegnate a me o alla mia squadra, con data, indirizzo e note — così so dove
 * e cosa fare. Li legge la RPC campo_miei_interventi (solo i miei).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InterventoCampo {
  id: string;
  titolo: string;
  tipo: string | null;
  stato: string | null;
  /** ISO con l'ora, se fissata. */
  data: string | null;
  indirizzo: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  cliente: string | null;
  telefono_cliente: string | null;
  order_id: string | null;
  /** Assegnato tramite la squadra (non a me di persona). */
  da_squadra: boolean;
  squadra: string | null;
}

export function useMieiInterventi(giorni = 30) {
  const { user } = useAuth();
  return useQuery<InterventoCampo[]>({
    queryKey: ["campo-miei-interventi", user?.id, giorni],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("campo_miei_interventi", { p_giorni: giorni });
      if (error) throw error;
      return (data ?? []) as unknown as InterventoCampo[];
    },
  });
}
