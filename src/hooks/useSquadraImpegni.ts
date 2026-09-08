/**
 * Gli impegni di una squadra in un periodo: altre commesse (con orari) e
 * impegni del suo calendario Google. Dalla RPC `squadra_impegni`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ImpegnoSquadra {
  fonte: "commessa" | "google";
  titolo: string;
  inizio: string;
  fine: string;
  tutto_il_giorno: boolean;
  order_id: string | null;
}

export function useSquadraImpegni(teamId: string | null, dal: string | null, al: string | null, commessaEsclusa: string | null) {
  return useQuery({
    queryKey: ["squadra-impegni", teamId, dal, al, commessaEsclusa],
    enabled: !!teamId && !!dal && !!al,
    staleTime: 60_000,
    queryFn: async (): Promise<ImpegnoSquadra[]> => {
      const { data, error } = await supabase.rpc("squadra_impegni" as never, {
        p_team_id: teamId,
        p_dal: dal,
        p_al: al,
        p_commessa_esclusa: commessaEsclusa,
      } as never);
      if (error) throw error;
      const righe: unknown = data;
      return (Array.isArray(righe) ? righe : []) as ImpegnoSquadra[];
    },
  });
}
