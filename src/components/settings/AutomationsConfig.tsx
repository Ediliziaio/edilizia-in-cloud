import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Zap, Pencil, Trash2, ListTodo, ArrowRightLeft, Bell } from "lucide-react";
import { AutomationDialog } from "./AutomationDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const TRIGGER_LABELS: Record<string, string> = {
  order_status_change: "Cambio stato commessa",
  order_created: "Nuova commessa creata",
  work_start_date_set: "Data inizio lavori impostata",
  work_end_date_set: "Data fine lavori impostata",
  payment_received: "Pagamento ricevuto",
  due_date_approaching: "Scadenza in avvicinamento",
};

const ACTION_ICONS: Record<string, typeof Zap> = {
  create_task: ListTodo,
  change_order_status: ArrowRightLeft,
  create_reminder: Bell,
};

export function AutomationsConfig() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: automations, isLoading } = useQuery({
    queryKey: ["automations", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("company_id", effectiveCompany!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("automations").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast({ title: "Automazione eliminata" });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleEdit = (auto: any) => {
    setEditAutomation(auto);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditAutomation(null);
    setDialogOpen(true);
  };

  const getActionsSummary = (actions: any[]) => {
    if (!actions || actions.length === 0) return "Nessuna azione";
    return actions.map(a => {
      switch (a.type) {
        case "create_task": return `Crea attività "${a.config?.title || "..."}"`;
        case "change_order_status": return "Cambia stato commessa";
        case "create_reminder": return `Promemoria "${a.config?.title || "..."}"`;
        default: return a.type;
      }
    }).join(" → ");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Automazioni
              </CardTitle>
              <CardDescription>
                Configura flussi automatici per gestire commesse, attività e promemoria.
              </CardDescription>
            </div>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" /> Nuova Automazione
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !automations || automations.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-1">Nessuna automazione</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crea la tua prima automazione per automatizzare i flussi operativi.
              </p>
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" /> Crea Automazione
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map(auto => {
                const actions = (auto.actions as any[]) || [];
                return (
                  <Card key={auto.id} className={`transition-opacity ${auto.is_active ? "" : "opacity-60"}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium truncate">{auto.name}</h4>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {TRIGGER_LABELS[auto.trigger_type] || auto.trigger_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {getActionsSummary(actions)}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            {actions.map((a: any, i: number) => {
                              const Icon = ACTION_ICONS[a.type] || Zap;
                              return <Icon key={i} className="h-3.5 w-3.5 text-muted-foreground" />;
                            })}
                            <span className="text-xs text-muted-foreground ml-1">
                              {actions.length} {actions.length === 1 ? "azione" : "azioni"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={auto.is_active}
                            onCheckedChange={v => toggleMutation.mutate({ id: auto.id, is_active: v })}
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(auto)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(auto.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AutomationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        automation={editAutomation}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["automations"] })}
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
