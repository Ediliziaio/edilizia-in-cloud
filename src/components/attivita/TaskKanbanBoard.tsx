import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { TaskCard } from "./TaskCard";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLUMNS = [
  { status: "da_fare", label: "Da fare", accent: "border-t-muted-foreground/40" },
  { status: "in_corso", label: "In corso", accent: "border-t-primary" },
  { status: "completata", label: "Completata", accent: "border-t-primary/60" },
] as const;

interface TaskKanbanBoardProps {
  tasks: any[];
  onTaskSelect: (task: any) => void;
}

export function TaskKanbanBoard({ tasks, onTaskSelect }: TaskKanbanBoardProps) {
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: newStatus,
          completed_at: newStatus === "completata" ? new Date().toISOString() : null,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
      toast.success("Stato aggiornato");
    },
  });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = { da_fare: [], in_corso: [], completata: [] };
    tasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [tasks]);

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  const onDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    const fromStatus = e.dataTransfer.getData("fromStatus");
    if (taskId && fromStatus !== targetStatus) {
      moveMutation.mutate({ taskId, newStatus: targetStatus });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.status] || [];
        return (
          <div
            key={col.status}
            className={cn(
              "flex flex-col rounded-lg border border-t-4 bg-muted/30",
              col.accent
            )}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, col.status)}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
              <span className="text-sm font-medium">{col.label}</span>
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
                      <TaskCard task={task} onSelect={() => onTaskSelect(task)} />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}
