import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, format, startOfDay } from "date-fns";
import { withClientTimeout } from "@/lib/query-timeout";

interface TaskCounts {
  total: number;
  overdue: number;
  dueToday: number;
}

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

      const base = () =>
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("assigned_to", userId)
          // Fuori il chiuso e i passi del flusso ancora "In attesa": il badge
          // conta il lavoro che si puo' fare ADESSO, non quello che aspetta il
          // proprio turno.
          .not("status", "in", "(completata,in_attesa)");

      // 2026-05-27: timeout 8 → 12s per maggior tolleranza mobile 4G.
      const [totalRes, overdueRes, todayRes] = await Promise.all([
        withClientTimeout(base(), "Conteggio attività", 12_000),
        withClientTimeout(base().lt("due_date", todayStart), "Conteggio attività scadute", 12_000),
        withClientTimeout(
          base().gte("due_date", todayStart).lt("due_date", tomorrowStart),
          "Conteggio attività di oggi",
          12_000,
        ),
      ]);

      const error = totalRes.error || overdueRes.error || todayRes.error;
      if (error) throw error;

      return {
        total: totalRes.count ?? 0,
        overdue: overdueRes.count ?? 0,
        dueToday: todayRes.count ?? 0,
      };
    },
    enabled: !!userId && !!companyId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    // 2026-05-27: silent — badge sidebar, se va in timeout il count
    // precedente resta visibile. No toast: era rumore intermittente.
    meta: { silent: true },
  });
}
