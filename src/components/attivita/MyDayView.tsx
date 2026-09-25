import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { MyDayHeader } from "./MyDayHeader";
import { MyDayTimeline } from "./MyDayTimeline";
import { MyDayEmptyState } from "./MyDayEmptyState";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { AlertCircle } from "lucide-react";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { isTaskDoneStatus } from "@/lib/taskStatuses";
import { useIsMobile } from "@/hooks/use-mobile";

interface MyDayViewProps {
  onNewTask: () => void;
}

export function MyDayView({ onNewTask }: MyDayViewProps) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [editingTask, setEditingTask] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: allTasks = [], isLoading, isError, error, refetch } = useQuery({
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!userId,
  });
  const observedStatuses = useMemo(() => Array.from(new Set(allTasks.map((task: any) => task.status).filter(Boolean))), [allTasks]);
  const { statuses: statusOptions } = useTaskStatuses(companyId, observedStatuses);
  const tasks = useMemo(
    () => allTasks.filter((task: any) => !isTaskDoneStatus(task.status, statusOptions)),
    [allTasks, statusOptions],
  );

  const { overdue, today, tomorrow, thisWeek, noDate, estimatedHoursToday } = useMemo(() => {
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
    const estimatedHoursToday = today.reduce((sum: number, t: any) => sum + (t.estimated_hours ?? 0), 0);
    return { overdue, today, tomorrow, thisWeek, noDate, estimatedHoursToday };
  }, [tasks]);

  const handleTaskSelect = (task: any) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
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

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Errore nel caricamento della giornata</p>
            <p className="mt-1 text-xs text-red-800">
              {error instanceof Error ? error.message : "Non riesco a leggere le attività in questo momento."}
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-7 border-red-200 bg-white text-red-700 hover:bg-red-100" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  const hasAnyTasks = overdue.length > 0 || today.length > 0 || tomorrow.length > 0 || thisWeek.length > 0 || noDate.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Su telefono il saluto c'e' gia' in cima alla pagina e i tre contatori
          ripetono i titoli delle sezioni qui sotto («Scadute 3», «Oggi 2»). */}
      {!isMobile && <MyDayHeader estimatedHoursToday={estimatedHoursToday} />}

      {!hasAnyTasks ? (
        <MyDayEmptyState onNewTask={onNewTask} />
      ) : (
        <div className="space-y-4 sm:space-y-6">
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
        onSaved={handleSaved}
      />
    </div>
  );
}
