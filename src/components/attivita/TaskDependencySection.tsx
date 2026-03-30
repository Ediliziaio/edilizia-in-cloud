import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Lock, ArrowRight, Search, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIORITY_DOT: Record<string, string> = {
  bassa:   "bg-slate-400",
  normale: "bg-blue-500",
  alta:    "bg-orange-500",
  urgente: "bg-red-500",
};

interface DepTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

interface TaskDependencySectionProps {
  taskId: string;
  companyId: string;
}

export function TaskDependencySection({ taskId, companyId }: TaskDependencySectionProps) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const qk = ["task-dependencies", taskId];

  // Tasks this task depends on (blockers)
  // Use explicit table hint `tasks!fk_column` because task_dependencies has two FKs to tasks
  const { data: blockers = [] } = useQuery({
    queryKey: [...qk, "blockers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_dependencies")
        .select("depends_on:tasks!depends_on_id(id, title, status, priority)")
        .eq("task_id", taskId);
      if (error) return [];
      return (data ?? []).map((r: any) => r.depends_on).filter(Boolean) as DepTask[];
    },
    enabled: !!taskId,
  });

  // Tasks blocked by this task
  const { data: blocking = [] } = useQuery({
    queryKey: [...qk, "blocking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_dependencies")
        .select("task:tasks!task_id(id, title, status, priority)")
        .eq("depends_on_id", taskId);
      if (error) return [];
      return (data ?? []).map((r: any) => r.task).filter(Boolean) as DepTask[];
    },
    enabled: !!taskId,
  });

  // All tasks in company for picker (excluding self and already linked)
  const { data: allTasks = [] } = useQuery({
    queryKey: ["all-tasks-for-dep", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, priority")
        .eq("company_id", companyId)
        .neq("id", taskId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) return [];
      return (data ?? []) as DepTask[];
    },
    enabled: addOpen && !!companyId,
  });

  const blockerIds = new Set(blockers.map((t) => t.id));
  const blockingIds = new Set(blocking.map((t) => t.id));

  const addMutation = useMutation({
    mutationFn: async (dependsOnId: string) => {
      const { error } = await supabase
        .from("task_dependencies")
        .insert({ task_id: taskId, depends_on_id: dependsOnId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setAddOpen(false);
    },
    onError: () => toast.error("Errore aggiunta dipendenza"),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ task_id, depends_on_id }: { task_id: string; depends_on_id: string }) => {
      const { error } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("task_id", task_id)
        .eq("depends_on_id", depends_on_id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk }),
    onError: () => toast.error("Errore rimozione dipendenza"),
  });

  const filtered = allTasks.filter((t) => {
    if (blockerIds.has(t.id) || blockingIds.has(t.id)) return false;
    return t.title.toLowerCase().includes(search.toLowerCase());
  });

  const hasBlockers = blockers.some((t) => t.status !== "completata");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex-1">
          Dipendenze
        </span>
        {hasBlockers && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-warning">
            Bloccata
          </Badge>
        )}
        <Popover open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (v) setSearch(""); }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Aggiungi
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="p-2 border-b">
              <p className="text-xs text-muted-foreground mb-1.5 px-1">
                Questa task dipende da:
              </p>
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca attività..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 text-sm pl-7"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {search ? "Nessun risultato" : "Nessuna altra attività"}
                </p>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2"
                    onClick={() => addMutation.mutate(t.id)}
                    disabled={addMutation.isPending}
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_DOT[t.priority] ?? "bg-slate-400")} />
                    <span className="flex-1 text-sm truncate">{t.title}</span>
                    {t.status === "completata" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {blockers.length === 0 && blocking.length === 0 && (
        <p className="text-xs text-muted-foreground/60 italic pl-7">Nessuna dipendenza</p>
      )}

      {/* Blockers: tasks this depends on */}
      {blockers.length > 0 && (
        <div className="pl-7 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Dipende da</p>
          {blockers.map((t) => (
            <div key={t.id} className={cn(
              "flex items-center gap-2 rounded border px-2.5 py-1.5",
              t.status !== "completata" ? "border-warning/40 bg-warning/5" : "border-border",
            )}>
              <span className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_DOT[t.priority] ?? "bg-slate-400")} />
              <span className={cn("flex-1 text-sm truncate", t.status === "completata" && "line-through text-muted-foreground")}>
                {t.title}
              </span>
              {t.status === "completata"
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                : <Lock className="h-3 w-3 text-warning shrink-0" />
              }
              <button
                className="text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => removeMutation.mutate({ task_id: taskId, depends_on_id: t.id })}
                title="Rimuovi dipendenza"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Blocking: tasks that depend on this */}
      {blocking.length > 0 && (
        <div className="pl-7 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sblocca</p>
          {blocking.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded border px-2.5 py-1.5 border-primary/20 bg-primary/5">
              <ArrowRight className="h-3 w-3 text-primary shrink-0" />
              <span className="flex-1 text-sm truncate">{t.title}</span>
              {t.status === "completata" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
