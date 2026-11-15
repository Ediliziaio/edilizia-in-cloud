import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sceltaDaRiga, SCELTA_PREDEFINITA, type SceltaRiepilogo } from "@/lib/orders/riepilogoCommesse";

const chiave = (companyId?: string | null) => ["riepilogo-commesse-scelta", companyId] as const;

/** La scelta dell'azienda per riquadri e grafico del riepilogo commesse. Senza riga: i predefiniti. */
export function useRiepilogoCommesse(companyId?: string | null) {
  const query = useQuery({
    queryKey: chiave(companyId),
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("company_riepilogo_commesse")
        .select("riquadri, grafico_serie, grafico_vista, grafico_forma")
        .eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      return sceltaDaRiga(data);
    },
  });
  return { scelta: query.data ?? SCELTA_PREDEFINITA, isLoading: query.isLoading };
}

export function useSalvaRiepilogoCommesse(companyId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scelta: SceltaRiepilogo) => {
      const { data, error } = await supabase.rpc("riepilogo_commesse_salva", {
        p_company_id: companyId!,
        p_riquadri: scelta.riquadri,
        p_grafico_serie: scelta.graficoSerie,
        p_grafico_vista: scelta.graficoVista,
        p_grafico_forma: scelta.graficoForma,
      });
      if (error) throw error;
      return sceltaDaRiga(data);
    },
    onSuccess: (scelta) => queryClient.setQueryData(chiave(companyId), scelta),
  });
}
