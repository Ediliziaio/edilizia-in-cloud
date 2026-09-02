import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckCircle2, Trash2, X, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { type TaskStatusDefinition, buildTaskStatusUpdate } from "@/lib/taskStatuses";

interface BulkActionsBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
  statusOptions?: TaskStatusDefinition[];
  /** Le attività caricate: servono per ricordare gli stati precedenti e offrire "Annulla". */
  tasks?: Array<{ id: string; status?: string | null; completed_at?: string | null }>;
}

export function BulkActionsBar({ selectedIds, onClear, statusOptions = [], tasks = [] }: BulkActionsBarProps) {
  const queryClient = useQueryClient();
  const count = selectedIds.size;

  /** Riporta ogni attività al suo stato di prima (raggruppando per stato: poche query). */
  const ripristinaStati = async (prima: Array<{ id: string; status: string | null; completed_at: string | null }>) => {
    const gruppi = new Map<string, { ids: string[]; status: string | null; completed_at: string | null }>();
    for (const p of prima) {
      const k = `${p.status ?? ""}|${p.completed_at ?? ""}`;
      if (!gruppi.has(k)) gruppi.set(k, { ids: [], status: p.status, completed_at: p.completed_at });
      gruppi.get(k)!.ids.push(p.id);
    }
    for (const g of gruppi.values()) {
      const { error } = await supabase.from("tasks").update({ status: g.status ?? "da_fare", completed_at: g.completed_at } as any).in("id", g.ids);
      if (error) { toast.error("Annullamento non riuscito", { description: error.message }); return; }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    toast.success(prima.length === 1 ? "1 attività ripristinata" : `${prima.length} attività ripristinate`);
  };

  const handleBulkComplete = async () => {
    const ids = Array.from(selectedIds);
    const prima = ids.map((id) => {
      const t = tasks.find((x) => x.id === id);
      return { id, status: t?.status ?? null, completed_at: t?.completed_at ?? null };
    });
    const doneStatus = statusOptions.find((status) => status.stage === "done")?.value || "completata";
    const { error } = await supabase
      .from("tasks")
      .update(buildTaskStatusUpdate(doneStatus, statusOptions) as any)
      .in("id", ids);
    if (error) {
      toast.error("Errore", { description: error.message });
    } else {
      toast.success(ids.length === 1 ? "1 attività completata" : `${ids.length} attività completate`, {
        duration: 8000,
        action: { label: "Annulla", onClick: () => { void ripristinaStati(prima); } },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      onClear();
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    if (error) {
      toast.error("Errore", { description: error.message });
    } else {
      toast.success(`${ids.length} attività eliminate`);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      onClear();
    }
  };

  const handleBulkPriority = async (priority: string) => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("tasks").update({ priority }).in("id", ids);
    if (error) {
      toast.error("Errore", { description: error.message });
    } else {
      toast.success(`Priorità aggiornata per ${ids.length} attività`);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      onClear();
    }
  };

  const handleBulkStatus = async (status: string) => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("tasks").update(buildTaskStatusUpdate(status, statusOptions) as any).in("id", ids);
    if (error) {
      toast.error("Errore", { description: error.message });
    } else {
      toast.success(`Stato aggiornato per ${ids.length} attività`);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      onClear();
    }
  };

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2.5">
      <span className="text-sm font-medium">{count} selezionat{count === 1 ? "a" : "e"}</span>

      <Button variant="outline" size="sm" onClick={handleBulkComplete}>
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
        Completa
      </Button>

      <Select onValueChange={handleBulkPriority}>
        <SelectTrigger className="w-[150px] h-8 text-sm">
          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
          <SelectValue placeholder="Priorità" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bassa">Bassa</SelectItem>
          <SelectItem value="normale">Normale</SelectItem>
          <SelectItem value="alta">Alta</SelectItem>
          <SelectItem value="urgente">Urgente</SelectItem>
        </SelectContent>
      </Select>

      <Select onValueChange={handleBulkStatus}>
        <SelectTrigger className="w-[160px] h-8 text-sm">
          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
          <SelectValue placeholder="Stato" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((status) => (
            <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1.5" />
            Elimina
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {count} attività?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
