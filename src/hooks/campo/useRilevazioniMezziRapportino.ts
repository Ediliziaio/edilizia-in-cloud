import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useRilevazioniMezziRapportino(companyId?: string, orderId?: string, reportId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["rapportino-rilevazioni-mezzi", orderId, companyId, reportId, user?.id],
    enabled: !!companyId && !!orderId && !!reportId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("mezzi_giornate").select("mezzo_id,usato,ore_lavorate,litri_riforniti,litri_consumati,mezzi!mezzi_giornate_mezzo_id_fkey(nome)")
        .eq("company_id", companyId!).eq("order_id", orderId!).eq("rapportino_id", reportId!)
        .or("ore_lavorate.not.is.null,litri_riforniti.not.is.null,litri_consumati.not.is.null");
      if (error?.code === "42703") return [];
      if (error) throw error;
      return data;
    },
  });
}
