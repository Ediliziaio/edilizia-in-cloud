import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Zap, Plus, Pencil, Trash2, Copy, Archive } from "lucide-react";
import { useState } from "react";
import type { AutomationFlow } from "@/types/automationBuilder";

interface Props {
  statusFilter: string;
}

export function AutomationFlowsList({ statusFilter }: Props) {
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: flows, isLoading } = useQuery({
    queryKey: ["automation-flows", effectiveCompany?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("automation_flows")
        .select("*")
        .eq("company_id", effectiveCompany!.id)
        .order("updated_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AutomationFlow[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazione eliminata" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("automation_flows").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-flows"] }),
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (flow: AutomationFlow) => {
      const { data, error } = await supabase
        .from("automation_flows")
        .insert({
          company_id: flow.company_id,
          name: `${flow.name} (copia)`,
          description: flow.description,
          status: "draft",
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Copy nodes
      const { data: nodes } = await supabase.from("automation_nodes").select("*").eq("flow_id", flow.id);
      if (nodes && nodes.length > 0) {
        const idMap: Record<string, string> = {};
        const newNodes = nodes.map(n => {
          const newId = crypto.randomUUID();
          idMap[n.id] = newId;
          return { id: newId, flow_id: data.id, company_id: n.company_id, node_type: n.node_type, position_x: n.position_x, position_y: n.position_y, config_json: n.config_json, label: n.label };
        });
        await supabase.from("automation_nodes").insert(newNodes);

        // Copy connections
        const { data: conns } = await supabase.from("automation_connections").select("*").eq("flow_id", flow.id);
        if (conns && conns.length > 0) {
          const newConns = conns.map(c => ({
            flow_id: data.id,
            company_id: c.company_id,
            from_node_id: idMap[c.from_node_id],
            to_node_id: idMap[c.to_node_id],
            label: c.label,
          })).filter(c => c.from_node_id && c.to_node_id);
          if (newConns.length > 0) await supabase.from("automation_connections").insert(newConns);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazione duplicata" });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (!flows || flows.length === 0) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1">Nessuna automazione</h3>
        <p className="text-sm text-muted-foreground mb-4">Crea la tua prima automazione visuale.</p>
        <Button onClick={() => navigate("/azienda/marketing/automazioni/nuova")}>
          <Plus className="h-4 w-4 mr-2" /> Crea Automazione
        </Button>
      </div>
    );
  }

  const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    draft: { label: "Bozza", variant: "secondary" },
    published: { label: "Attiva", variant: "default" },
    archived: { label: "Archiviata", variant: "outline" },
  };

  return (
    <>
      <div className="space-y-3">
        {flows.map(flow => {
          const badge = STATUS_BADGE[flow.status] || STATUS_BADGE.draft;
          return (
            <Card
              key={flow.id}
              className={`cursor-pointer transition-all hover:shadow-md ${flow.status === "archived" ? "opacity-60" : ""}`}
              onClick={() => navigate(`/azienda/marketing/automazioni/${flow.id}`)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-orange-500 shrink-0" />
                      <h4 className="font-medium truncate">{flow.name}</h4>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    {flow.description && (
                      <p className="text-xs text-muted-foreground truncate">{flow.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Aggiornata: {new Date(flow.updated_at).toLocaleDateString("it-IT")}
                      {flow.version > 1 && ` · v${flow.version}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <Switch
                      checked={flow.status === "published"}
                      onCheckedChange={v =>
                        toggleMutation.mutate({ id: flow.id, status: v ? "published" : "draft" })
                      }
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/azienda/marketing/automazioni/${flow.id}`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateMutation.mutate(flow)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => toggleMutation.mutate({ id: flow.id, status: "archived" })}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(flow.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina automazione</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Tutti i nodi e le connessioni verranno eliminati.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
