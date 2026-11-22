import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import type { CalendarScope } from "@/types/calendar";
import { coordinate } from "../../shared/mappa-operativa/calcoli";

export function useStoricoCantieriMappa(requestedScope: CalendarScope, anno: number | null) {
  const { user, effectiveCompany } = useAuth();
  const company = effectiveCompany?.id;
  const p = usePermissions();
  const personale = requestedScope !== "team" || p.onlyAssignedWork || !(p.isAdmin || p.canViewAllTeamCalendar);
  const enabled = Boolean(company && user?.id && !p.isLoading && p.canViewCalendar && p.canViewOrders);
  return useQuery({
    queryKey: [...queryKeys.calendarOrders.storicoMappa(company), user?.id, Boolean(personale), anno],
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!company || !user?.id || !enabled) throw new Error("Accesso ai cantieri del calendario richiesto");
      let dopo: string | undefined;
      const cantieri = [];
      do {
        const { data, error } = await supabase.rpc("mappa_storico_cantieri", {
          p_company: company, p_anno: anno, p_personale: Boolean(personale), p_dopo: dopo,
        }).abortSignal(signal);
        if (error) throw error;
        cantieri.push(...data);
        dopo = data.length === 250 ? data.at(-1)?.id : undefined;
      } while (dopo);
      return cantieri.map(c => ({
        id: c.id, titolo: c.titolo, codice: c.codice, indirizzo: c.indirizzo,
        punto: coordinate(c.lat, c.lng), data: c.data, chiusuraRegistrata: c.chiusura_registrata,
      }));
    },
  });
}
