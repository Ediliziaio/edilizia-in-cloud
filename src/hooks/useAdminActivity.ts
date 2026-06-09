import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityEntry {
  last_sign_in_at: string | null;
  created_at: string | null;
}

/**
 * useAdminActivity — risolve l'attività di accesso (ultimo login) di una lista
 * di utenti via la edge function `get-admin-activity` (gate super_admin).
 * Ritorna una mappa userId → { last_sign_in_at, created_at }. Solo per le
 * dashboard superadmin (produttori/commercialisti).
 */
export function useAdminActivity(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))].sort();
  const key = ids.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity", key],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ActivityEntry>> => {
      const { data, error } = await supabase.functions.invoke("get-admin-activity", {
        body: { user_ids: ids },
      });
      if (error) throw new Error(error.message);
      return (data as { activity?: Record<string, ActivityEntry> })?.activity ?? {};
    },
  });

  return { activity: data ?? {}, isLoading: isLoading && ids.length > 0 };
}
