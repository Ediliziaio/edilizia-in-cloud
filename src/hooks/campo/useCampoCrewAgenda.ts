import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isLocalCrewBackend } from "@/lib/orders/internalTeamRoster";
import type { CrewRpcClient } from "@/lib/orders/internalTeamRosterApi";
import { loadCampoCrewAgenda, validAgendaRange } from "@/lib/campo/crewAgenda";

const config = { url: import.meta.env.VITE_SUPABASE_URL, optIn: import.meta.env.VITE_INTERNAL_TEAM_ROSTERS_LOCAL };
export const campoCrewAgendaEnabled = isLocalCrewBackend(config.url, config.optIn);

export function useCampoCrewAgenda(from: string, to = from) {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["campo-crew-agenda", profile?.company_id, user?.id, from, to],
    enabled: campoCrewAgendaEnabled && !!user?.id && !!profile?.company_id && validAgendaRange(from, to),
    queryFn: () => loadCampoCrewAgenda(supabase as unknown as CrewRpcClient, config, profile!.company_id!, from, to),
    retry: false, staleTime: 15_000, refetchInterval: 30_000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: "always", refetchOnReconnect: "always",
  });
}
