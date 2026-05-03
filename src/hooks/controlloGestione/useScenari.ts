/**
 * Hook React Query — elenco scenari piano industriale per la company corrente.
 * RLS gestita lato DB tramite policy su `piano_industriale_assumptions`.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";

export interface ScenarioRow {
  id: string;
  scenario: string;
  is_default: boolean;
  orizzonte_anni: number;
}

export function useScenari() {
  return useQuery({
    queryKey: queryKeys.controlloGestione.classificazione("scenari"),
    queryFn: async (): Promise<ScenarioRow[]> => {
      const { data, error } = await supabase
        .from("piano_industriale_assumptions")
        .select("id, scenario, is_default, orizzonte_anni")
        .order("is_default", { ascending: false })
        .order("scenario", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScenarioRow[];
    },
    staleTime: 10 * 60_000,
  });
}
