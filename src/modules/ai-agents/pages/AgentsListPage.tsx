import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bot, Plus } from "lucide-react";
import { AgentCard } from "../components/AgentCard";
import { CreateAgentWizard } from "../components/CreateAgentWizard";
import { useAgents, useCreateAgent, useDeleteAgent } from "../hooks/useAgents";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function AgentsListPage() {
  const { data: agents, isLoading } = useAgents();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Stable mutation — always uses "archive-action" as key, passes id via mutationFn
  const archiveMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from("ai_agents" as never)
        .update({ status: "archived", updated_at: new Date().toISOString() } as never)
        .eq("id", agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      toast.success("Agente archiviato");
      setArchiveId(null);
    },
    onError: () => {
      toast.error("Errore nell'archiviazione");
      setArchiveId(null);
    },
  });

  const handleConfirmArchive = () => {
    if (!archiveId) return;
    archiveMutation.mutate(archiveId);
  };

  const filteredAgents = agents?.filter(a =>
    showArchived ? true : a.status !== "archived"
  );

  const archivedCount = agents?.filter(a => a.status === "archived").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Agenti AI</h1>
          {agents && <Badge variant="secondary">{agents.length}</Badge>}
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo agente
        </Button>
      </div>

      {/* Filter: show archived */}
      {archivedCount > 0 && (
        <div className="flex items-center gap-2">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} id="show-archived" />
          <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
            Mostra archiviati ({archivedCount})
          </Label>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredAgents?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Nessun agente creato</h2>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Crea il tuo primo agente AI per gestire conversazioni, qualificare lead e fissare appuntamenti automaticamente.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Crea il primo agente
          </Button>
        </div>
      )}

      {/* Agent list */}
      {!isLoading && filteredAgents && filteredAgents.length > 0 && (
        <div className="space-y-3">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onArchive={(id) => setArchiveId(id)}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      )}

      {/* Create wizard */}
      <CreateAgentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSubmit={(data) => createAgent.mutate(data)}
        isLoading={createAgent.isPending}
      />

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveId} onOpenChange={(open) => !open && setArchiveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiviare questo agente?</AlertDialogTitle>
            <AlertDialogDescription>
              L'agente verrà archiviato e non sarà più visibile nella lista principale. Potrai riattivarlo in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmArchive}>
              Archivia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo agente?</AlertDialogTitle>
            <AlertDialogDescription>
              L'agente verrà eliminato definitivamente. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteAgent.mutate(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
