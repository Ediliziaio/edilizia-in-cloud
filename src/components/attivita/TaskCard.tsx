import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, AlertTriangle, CalendarDays } from "lucide-react";
import { PrioritaBadge } from "./PrioritaBadge";
import { cn } from "@/lib/utils";
import { format, isToday, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logTaskActivity } from "@/lib/taskActivityLog";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import {
  type TaskStatusDefinition,
  buildTaskStatusUpdate,
  getNextTaskStatusForQuickAction,
  getTaskStatusEventType,
  getTaskStatusTransitionDescription,
  isTaskDoneStatus,
} from "@/lib/taskStatuses";

interface TaskCardProps {
  task: any;
  statusOptions?: TaskStatusDefinition[];
  onSelect: () => void;
}

export function TaskCard({ task, statusOptions, onSelect }: TaskCardProps) {
  const queryClient = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { statuses: fallbackStatuses } = useTaskStatuses(companyId, [task.status].filter(Boolean));
  const statuses = statusOptions?.length ? statusOptions : fallbackStatuses;
  const isCompleted = isTaskDoneStatus(task.status, statuses);
  const isOverdue = !isCompleted && task.due_date && new Date(task.due_date) < new Date();
  const nextStatus = getNextTaskStatusForQuickAction(task.status, statuses);

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const updates = buildTaskStatusUpdate(nextStatus.value, statuses);
      const { error } = await supabase
        .from("tasks")
        .update(updates as any)
        .eq("id", task.id);
      if (error) throw error;
      await logTaskActivity({
        companyId,
        userId: user?.id,
        taskId: task.id,
        taskTitle: task.title,
        eventType: getTaskStatusEventType(task.status, nextStatus.value, statuses),
        description: getTaskStatusTransitionDescription(task.status, nextStatus.value, statuses),
        changes: updates,
        beforeSnapshot: task,
        afterSnapshot: { ...task, ...updates },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
      toast.success(`Stato aggiornato: ${nextStatus.label}`);
    },
  });

  const scadenzaLabel = (() => {
    if (!task.due_date) return null;
    const d = new Date(task.due_date);
    if (isOverdue) {
      const giorni = differenceInDays(new Date(), d);
      return { text: `${giorni}g fa`, className: "text-destructive font-medium" };
    }
    if (isToday(d)) return { text: "Oggi", className: "text-primary font-medium" };
    return { text: format(d, "d MMM", { locale: it }), className: "text-muted-foreground" };
  })();

  const correlation = (() => {
    if (task.order) return { label: task.order.order_code || task.order.description?.slice(0, 20), to: `/azienda/ordini/${task.order_id}` };
    if (task.contact) return { label: `${task.contact.first_name} ${task.contact.last_name}`, to: `/azienda/marketing/contatti/${task.contact_id}` };
    if (task.opportunity) return { label: task.opportunity.name, to: `/azienda/marketing/opportunita` };
    if (task.stock_item) return { label: task.stock_item.name, to: null };
    if (task.cost) return { label: task.cost.name, to: null };
    return null;
  })();

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
        isOverdue && "border-destructive/30 bg-destructive/5",
        isCompleted && "opacity-60"
      )}
      onClick={onSelect}
    >
      <div className="mt-0.5" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(); }}>
        <Checkbox checked={isCompleted} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn("text-sm font-medium truncate", isCompleted && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <PrioritaBadge priorita={task.priority} />
          {task.assigned_profile && (
            <span className="text-[11px] text-muted-foreground">
              {task.assigned_profile.first_name} {task.assigned_profile.last_name?.[0]}.
            </span>
          )}
          <TaskStatusBadge status={task.status} statuses={statuses} compact className="h-5 px-1.5 text-[10px]" />
          {scadenzaLabel && (
            <span className={cn("text-[11px] flex items-center gap-0.5", scadenzaLabel.className)}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <CalendarDays className="h-3 w-3" />
              {scadenzaLabel.text}
            </span>
          )}
          {correlation && (
            correlation.to ? (
              <Link
                to={correlation.to}
                className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                {correlation.label}
              </Link>
            ) : (
              <span className="text-[11px] text-muted-foreground">{correlation.label}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
