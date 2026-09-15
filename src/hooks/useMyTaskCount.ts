import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, format, startOfDay } from "date-fns";
import { withClientTimeout } from "@/lib/query-timeout";
import { contaAttivita, LIMITE_RIGHE_ATTIVITA, type ConteggiAttivita } from "@/lib/badgeConteggi";

type TaskCounts = ConteggiAttivita;

export function useMyTaskCount(): { data: TaskCounts | null; isLoading: boolean } {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;

  return useQuery({
    queryKey: ["my-task-count", userId, companyId],
    queryFn: async (): Promise<TaskCounts> => {
      if (!userId || !companyId) return { total: 0, overdue: 0, dueToday: 0 };

      const now = new Date();
      const todayStart = format(startOfDay(now), "yyyy-MM-dd");
      const tomorrowStart = format(startOfDay(addDays(now, 1)), "yyyy-MM-dd");

      // 15/09/2026: una richiesta invece di tre. Il count esatto è il totale;
      // le righe in ordine di scadenza (senza data in fondo) mettono in testa
      // scadute e di oggi, che si contano lato client.
      const query = supabase
        .from("tasks")
        .select("due_date", { count: "exact" })
        .eq("company_id", companyId)
        .eq("assigned_to", userId)
        // Fuori il chiuso e i passi del flusso ancora "In attesa": il badge
        // conta il lavoro che si puo' fare ADESSO, non quello che aspetta il
        // proprio turno.
        .not("status", "in", "(completata,in_attesa)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(LIMITE_RIGHE_ATTIVITA);

      // 2026-05-27: timeout 8 → 12s per maggior tolleranza mobile 4G.
      const res = await withClientTimeout(query, "Conteggio attività", 12_000);
      if (res.error) throw res.error;

      return contaAttivita(res.data, res.count, todayStart, tomorrowStart);
    },
    enabled: !!userId && !!companyId,
    // 15/09/2026: 60s → 180s, mai con la scheda nascosta; al ritorno sulla
    // scheda si aggiorna subito.
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    // 2026-05-27: silent — badge sidebar, se va in timeout il count
    // precedente resta visibile. No toast: era rumore intermittente.
    meta: { silent: true },
  });
}
