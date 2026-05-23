import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { TaskCard } from "./TaskCard";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { logTaskActivity } from "@/lib/taskActivityLog";
import {
  TASK_STATUS_TONE_CLASSES,
  type TaskStatusDefinition,
  buildTaskStatusUpdate,
  getTaskStatusEventType,
  getTaskStatusTransitionDescription,
  mergeTaskStatusDefinitions,
} from "@/lib/taskStatuses";

interface TaskKanbanBoardProps {
  tasks: any[];
  statusOptions?: TaskStatusDefinition[];
  onTaskSelect: (task: any) => void;
  onAddTaskToColumn?: (status: string) => void;
}

export function TaskKanbanBoard({ tasks, statusOptions, onTaskSelect, onAddTaskToColumn }: TaskKanbanBoardProps) {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const columns = statusOptions?.length
    ? statusOptions
    : mergeTaskStatusDefinitions({ observedStatuses: tasks.map((task) => task.status).filter(Boolean) });

  const moveMutation = useMutation({
    mutationFn: async ({ task, newStatus }: { task: any; newStatus: string }) => {
      const updates = buildTaskStatusUpdate(newStatus, columns);
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
        eventType: getTaskStatusEventType(task.status, newStatus, columns),
        description: getTaskStatusTransitionDescription(task.status, newStatus, columns),
        changes: updates,
        beforeSnapshot: task,
        afterSnapshot: { ...task, ...updates },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
      toast.success("Stato aggiornato");
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = Object.fromEntries(columns.map((column) => [column.value, []]));
    tasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [tasks, columns]);

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const onDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    const fromStatus = e.dataTransfer.getData("fromStatus");
    if (taskId && fromStatus !== targetStatus) {
      const task = tasks.find((item) => item.id === taskId);
      if (task) moveMutation.mutate({ task, newStatus: targetStatus });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => {
        const items = grouped[col.value] || [];
        const tone = TASK_STATUS_TONE_CLASSES[col.tone] || TASK_STATUS_TONE_CLASSES.slate;
        return (
          <div
            key={col.value}
            className={cn(
              "flex flex-col rounded-lg border border-t-4 bg-muted/30",
              tone.column
            )}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, col.value)}
          >
            <div className={cn("flex items-center justify-between px-3 py-2 border-b", tone.panel)}>
              <div className="min-w-0">
                <span className="block truncate text-sm font-medium">{col.label}</span>
                {col.description && (
                  <span className="block truncate text-[10px] text-muted-foreground">{col.description}</span>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            </div>
            <ScrollArea className="flex-1 max-h-[calc(100vh-420px)] min-h-[200px]">
              <div className="p-2 space-y-2">
                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nessuna attività
                  </div>
                ) : (
                  items.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("taskId", task.id);
                        e.dataTransfer.setData("fromStatus", task.status);
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <TaskCard task={task} statusOptions={columns} onSelect={() => onTaskSelect(task)} />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            {onAddTaskToColumn && (
              <div className="p-2 border-t bg-background/30">
                <button
                  onClick={() => onAddTaskToColumn(col.value)}
                  className="w-full text-left text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Aggiungi attività
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
