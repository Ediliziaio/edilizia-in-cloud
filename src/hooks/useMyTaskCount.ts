import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isBefore, isAfter, addDays, startOfDay } from "date-fns";

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

      const { data, error } = await supabase
        .from("tasks")
        .select("id, due_date, status")
        .eq("company_id", companyId)
        .eq("assigned_to", userId)
        .neq("status", "completata");

      if (error) throw error;
      const tasks = data || [];
      const now = new Date();
      const todayStart = startOfDay(now);
      const tomorrowStart = startOfDay(addDays(now, 1));

      let overdue = 0;
      let dueToday = 0;
      for (const t of tasks) {
        if (t.due_date) {
          const due = new Date(t.due_date);
          if (isBefore(due, todayStart)) overdue++;
          else if (isBefore(due, tomorrowStart) && isAfter(due, todayStart) || due.getTime() === todayStart.getTime()) dueToday++;
        }
      }

      return { total: tasks.length, overdue, dueToday };
    },
    enabled: !!userId && !!companyId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
