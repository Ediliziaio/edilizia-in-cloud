/**
 * Checklist di un'attività, con responsabile e scadenza per voce.
 *
 * Fino al 2026-09-02 era una lista piatta di titoli: "Posa in opera" non
 * poteva dire chi fa il piano terra e chi il primo, né entro quando. Ogni voce
 * è ora una piccola sottoattività, senza però moltiplicare le righe nella
 * Regia: restano dentro l'attività madre.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Plus, Trash2, ListChecks, CalendarClock, UserRound } from "lucide-react";
import { ChipIcona } from "./SezioneCard";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { logTaskActivity } from "@/lib/taskActivityLog";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";

interface TaskChecklistProps {
  taskId: string;
  companyId?: string;
  taskTitle?: string;
}

interface VoceChecklist {
  id: string;
  title: string;
  is_completed: boolean;
  position: number;
  assigned_to: string | null;
  due_date: string | null;
}

const oggiIso = () => new Date().toISOString().split("T")[0];

function dataBreve(iso: string): string {
  const [, m, g] = iso.split("-");
  return `${g}/${m}`;
}

export function TaskChecklist({ taskId, companyId, taskTitle }: TaskChecklistProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [newItem, setNewItem] = useState("");
  const queryKey = ["task-checklist", taskId];
  const { data: staff = [] } = useCompanyStaffUsers(companyId ?? null);

  const { data: items = [] } = useQuery<VoceChecklist[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_checklist_items")
        .select("id, title, is_completed, position, assigned_to, due_date")
        .eq("task_id", taskId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as VoceChecklist[];
    },
  });

  const nomeDi = (id: string | null) => {
    if (!id) return null;
    const u = staff.find((s) => s.id === id);
    return u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente" : "Utente";
  };

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["task-activity-log", companyId, taskId] });
  };

  const addMutation = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from("task_checklist_items").insert({
        task_id: taskId,
        title,
        position: items.length,
      } as never);
      if (error) throw error;
      await logTaskActivity({
        companyId, userId: user?.id, taskId, taskTitle,
        eventType: "task_checklist_item_added",
        description: "ha aggiunto un elemento checklist",
        metadata: { title },
      });
    },
    onSuccess: () => { invalida(); setNewItem(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase
        .from("task_checklist_items")
        .update({ is_completed } as never)
        .eq("id", id);
      if (error) throw error;
      await logTaskActivity({
        companyId, userId: user?.id, taskId, taskTitle,
        eventType: is_completed ? "task_checklist_item_completed" : "task_checklist_item_reopened",
        description: is_completed ? "ha completato un elemento checklist" : "ha riaperto un elemento checklist",
        changes: { checklist_item_id: id, is_completed },
      });
    },
    onSuccess: invalida,
  });

  /** Responsabile o scadenza della singola voce. */
  const dettaglioMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { assigned_to?: string | null; due_date?: string | null } }) => {
      const { error } = await supabase.from("task_checklist_items").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
    onError: (e: Error) => toast.error("Modifica non salvata", { description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_checklist_items").delete().eq("id", id);
      if (error) throw error;
      await logTaskActivity({
        companyId, userId: user?.id, taskId, taskTitle,
        eventType: "task_checklist_item_deleted",
        description: "ha eliminato un elemento checklist",
        changes: { checklist_item_id: id },
      });
    },
    onSuccess: invalida,
  });

  const completed = items.filter((i) => i.is_completed).length;
  const total = items.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ChipIcona icon={ListChecks} tono="blu" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Checklist
        </span>
        {total > 0 && <span className="ml-auto text-[10px] text-muted-foreground">{completed}/{total}</span>}
      </div>
      {total > 0 && <Progress value={percent} className="h-1.5" />}

      <div className="space-y-1">
        {items.map((item) => {
          const inRitardo = !item.is_completed && !!item.due_date && item.due_date < oggiIso();
          return (
            <div key={item.id} className="group flex items-center gap-2">
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={(checked) => toggleMutation.mutate({ id: item.id, is_completed: !!checked })}
                aria-label={item.is_completed ? `Riapri ${item.title}` : `Completa ${item.title}`}
              />
              <span className={`flex-1 truncate text-sm ${item.is_completed ? "text-muted-foreground line-through" : ""}`} title={item.title}>
                {item.title}
              </span>

              {/* Responsabile della voce */}
              <Select
                value={item.assigned_to ?? "none"}
                onValueChange={(val) => dettaglioMutation.mutate({ id: item.id, patch: { assigned_to: val === "none" ? null : val } })}
              >
                <SelectTrigger
                  className={`h-6 w-auto gap-1 border-none px-1 text-[11px] shadow-none hover:bg-muted ${item.assigned_to ? "text-slate-700 dark:text-slate-300" : "text-muted-foreground"}`}
                  aria-label={`Responsabile di ${item.title}`}
                >
                  <UserRound className="h-3 w-3" />
                  <span className="max-w-[86px] truncate">{nomeDi(item.assigned_to) ?? "chi?"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {staff.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{`${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Scadenza della voce */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] hover:bg-muted ${inRitardo ? "font-semibold text-red-600" : item.due_date ? "text-slate-700 dark:text-slate-300" : "text-muted-foreground"}`}
                    aria-label={`Scadenza di ${item.title}`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {item.due_date ? dataBreve(item.due_date) : "quando?"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="end">
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={item.due_date ?? ""}
                    onChange={(e) => dettaglioMutation.mutate({ id: item.id, patch: { due_date: e.target.value || null } })}
                  />
                  {item.due_date && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-7 w-full text-xs"
                      onClick={() => dettaglioMutation.mutate({ id: item.id, patch: { due_date: null } })}
                    >
                      Togli la scadenza
                    </Button>
                  )}
                </PopoverContent>
              </Popover>

              <button
                onClick={() => deleteMutation.mutate(item.id)}
                className="text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                aria-label={`Elimina ${item.title}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) addMutation.mutate(newItem.trim()); }}
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
          aria-label="Aggiungi elemento alla checklist"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
