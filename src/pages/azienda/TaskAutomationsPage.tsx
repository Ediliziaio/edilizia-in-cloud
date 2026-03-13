import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Zap, Pencil, Trash2, ListTodo, Play } from "lucide-react";
import { TaskAutomationFormDialog } from "@/components/automazioni/TaskAutomationFormDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const TRIGGER_LABELS: Record<string, string> = {
  contact_created: "👤 Nuovo contatto/lead",
  opportunity_created: "🆕 Opportunità creata",
  opportunity_stage_changed: "🔄 Opportunità cambia fase",
  appointment_confirmed: "📅 Appuntamento confermato",
  appointment_completed: "✅ Appuntamento completato",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgente: "🔴 Urgente",
  alta: "🟠 Alta",
  normale: "🔵 Normale",
  bassa: "⚪ Bassa",
};

const PRESET_RULES = [
  {
    name: "Nuovo lead → Chiamata entro oggi",
    trigger_type: "contact_created",
    action_title: "Prima chiamata a {{contact_name}}",
    action_priority: "alta",
    action_assign_to: "entity_assignee",
    action_due_days: 0,
    action_category: "chiamata",
  },
  {
    name: "Appuntamento confermato → Prepara presentazione",
    trigger_type: "appointment_confirmed",
    action_title: "Prepara presentazione per {{contact_name}}",
    action_priority: "alta",
    action_assign_to: "entity_assignee",
    action_due_days: 1,
    action_category: "preparazione",
  },
  {
    name: "Appuntamento completato → Follow-up offerta",
    trigger_type: "appointment_completed",
    action_title: "Invia offerta a {{contact_name}}",
    action_priority: "alta",
    action_assign_to: "entity_assignee",
    action_due_days: 2,
    action_category: "offerta",
  },
  {
    name: "Nuova opportunità → Analisi iniziale",
    trigger_type: "opportunity_created",
    action_title: "Analisi opportunità: {{opportunity_name}}",
    action_priority: "normale",
    action_assign_to: "entity_assignee",
    action_due_days: 1,
    action_category: "analisi",
  },
];

export default function TaskAutomationsPage() {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["task-automation-rules", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_automation_rules")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("task_automation_rules")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-automation-rules"] }),
    onError: (err: any) => toast.error("Errore", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("task_automation_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-automation-rules"] });
      toast.success("Automazione eliminata");
      setDeleteId(null);
    },
    onError: (err: any) => toast.error("Errore", { description: err.message }),
  });

  const handleEdit = (rule: any) => {
    setEditRule(rule);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditRule(null);
    setDialogOpen(true);
  };

  const handlePreset = (preset: (typeof PRESET_RULES)[0]) => {
    setEditRule({ ...preset, _preset: true });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automazioni Task</h1>
        <p className="text-muted-foreground">
          Crea task automaticamente quando accadono eventi nel CRM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Regole di automazione
              </CardTitle>
              <CardDescription>
                Quando si verifica un evento, viene creato automaticamente un task.
              </CardDescription>
            </div>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" /> Nuova Regola
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !rules || rules.length === 0 ? (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">Nessuna automazione task</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Inizia con una delle regole suggerite o creane una personalizzata.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Regole suggerite per iniziare
                </p>
                <div className="grid gap-2">
                  {PRESET_RULES.map((preset, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 border rounded-md bg-background"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{preset.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {TRIGGER_LABELS[preset.trigger_type]} → "{preset.action_title}"
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePreset(preset)}
                      >
                        Aggiungi
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map(rule => (
                <Card key={rule.id} className={`transition-opacity ${rule.is_active ? "" : "opacity-60"}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate">{rule.name}</h4>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          → Crea: "{rule.action_title}" · Priorità {rule.action_priority}
                          {rule.action_due_days != null && ` · Scadenza +${rule.action_due_days}g`}
                        </p>
                        {rule.last_executed_at && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Ultima esecuzione:{" "}
                            {format(new Date(rule.last_executed_at), "d MMM yyyy HH:mm", { locale: it })}
                            {" · "}{rule.executions_count} task creati
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={v => toggleMutation.mutate({ id: rule.id, is_active: v })}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(rule.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskAutomationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={editRule}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["task-automation-rules"] })}
      />

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina automazione</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Vuoi procedere?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
