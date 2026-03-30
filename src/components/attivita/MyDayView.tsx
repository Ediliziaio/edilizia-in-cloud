import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { MyDayHeader } from "./MyDayHeader";
import { MyDayTimeline } from "./MyDayTimeline";
import { MyDayEmptyState } from "./MyDayEmptyState";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { startOfDay, endOfDay, addDays } from "date-fns";

interface MyDayViewProps {
  onNewTask: () => void;
}

export function MyDayView({ onNewTask }: MyDayViewProps) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;

  const [editingTask, setEditingTask] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: [...queryKeys.tasks.all, "my-day", userId, companyId],
    queryFn: async () => {
      if (!companyId || !userId) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          assigned_profile:profiles!tasks_assigned_to_fkey(first_name, last_name),
          order:orders!tasks_order_id_fkey(description, order_code),
          stock_item:warehouse_stock!tasks_stock_item_id_fkey(name),
          cost:company_costs!tasks_cost_id_fkey(name),
          contact:marketing_contacts!tasks_contact_id_fkey(first_name, last_name),
          opportunity:marketing_opportunities!tasks_opportunity_id_fkey(name)
        `)
        .eq("company_id", companyId)
        .eq("assigned_to", userId)
        .neq("status", "completata")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!userId,
  });

  const { overdue, today, tomorrow, thisWeek, noDate } = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowEnd = endOfDay(addDays(now, 1));
    const weekEnd = endOfDay(addDays(now, 7));

    const overdue: any[] = [];
    const today: any[] = [];
    const tomorrow: any[] = [];
    const thisWeek: any[] = [];
    const noDate: any[] = [];

    for (const t of tasks) {
      if (!t.due_date) {
        noDate.push(t);
      } else {
        const d = new Date(t.due_date);
        if (d < todayStart) overdue.push(t);
        else if (d <= todayEnd) today.push(t);
        else if (d <= tomorrowEnd) tomorrow.push(t);
        else if (d <= weekEnd) thisWeek.push(t);
      }
    }
    return { overdue, today, tomorrow, thisWeek, noDate };
  }, [tasks]);

  const handleTaskSelect = (task: any) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const hasAnyTasks = overdue.length > 0 || today.length > 0 || tomorrow.length > 0 || thisWeek.length > 0 || noDate.length > 0;

  return (
    <div className="space-y-6">
      <MyDayHeader />

      {!hasAnyTasks ? (
        <MyDayEmptyState onNewTask={onNewTask} />
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <MyDayTimeline title="Scadute" tasks={overdue} variant="overdue" onTaskSelect={handleTaskSelect} />
          )}
          {today.length > 0 && (
            <MyDayTimeline title="Oggi" tasks={today} variant="today" onTaskSelect={handleTaskSelect} />
          )}
          {tomorrow.length > 0 && (
            <MyDayTimeline title="Domani" tasks={tomorrow} variant="nodate" onTaskSelect={handleTaskSelect} collapsible />
          )}
          {thisWeek.length > 0 && (
            <MyDayTimeline title="Questa settimana" tasks={thisWeek} variant="nodate" onTaskSelect={handleTaskSelect} collapsible />
          )}
          {noDate.length > 0 && (
            <MyDayTimeline title="Senza scadenza" tasks={noDate} variant="nodate" onTaskSelect={handleTaskSelect} collapsible />
          )}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        onSaved={() => {}}
      />
    </div>
  );
}
