import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface TaskChecklistProps {
  taskId: string;
}

export function TaskChecklist({ taskId }: TaskChecklistProps) {
  const queryClient = useQueryClient();
  const [newItem, setNewItem] = useState("");

  const queryKey = ["task-checklist", taskId];

  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_checklist_items" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from("task_checklist_items" as any).insert({
        task_id: taskId,
        title,
        position: items.length,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setNewItem("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase
        .from("task_checklist_items" as any)
        .update({ is_completed } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_checklist_items" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const completed = items.filter((i: any) => i.is_completed).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Checklist
        </span>
        {total > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {completed}/{total}
          </span>
        )}
      </div>

      {total > 0 && <Progress value={percent} className="h-1.5" />}

      <div className="space-y-1">
        {items.map((item: any) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <Checkbox
              checked={item.is_completed}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ id: item.id, is_completed: !!checked })
              }
            />
            <span className={`text-sm flex-1 ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
              {item.title}
            </span>
            <button
              onClick={() => deleteMutation.mutate(item.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newItem.trim()) addMutation.mutate(newItem.trim());
          }}
          placeholder="Aggiungi elemento..."
          className="h-7 text-sm"
          maxLength={200}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => newItem.trim() && addMutation.mutate(newItem.trim())}
          disabled={!newItem.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
