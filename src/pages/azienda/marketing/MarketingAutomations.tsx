import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { CreateFolderDialog } from "@/components/email-marketing/CreateFolderDialog";
import { Plus, FolderPlus, Search, Sparkles } from "lucide-react";

export default function MarketingAutomations() {
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const safeName = name.trim().slice(0, 100);
      if (!safeName) throw new Error("Il nome della cartella non può essere vuoto.");
      const { error } = await supabase.from("automation_folders").insert({
        company_id: effectiveCompany!.id,
        name: safeName,
        parent_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-folders-all"] });
      toast({ title: "Cartella creata" });
      setFolderDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Elenco Flusso di lavoro</h1>
          <p className="text-muted-foreground text-sm">
            Gestisci i flussi di lavoro di automazione marketing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" /> Crea Cartella
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Sparkles className="h-4 w-4 mr-1.5" /> Crea tramite AI
          </Button>
          <Button size="sm" onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Plus className="h-4 w-4 mr-1.5" /> Crea Flusso di lavoro
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca flusso di lavoro..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Flows list with built-in filter chips */}
      <AutomationFlowsList
        searchQuery={searchQuery}
      />

      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={(name) => createFolderMutation.mutate(name)}
        isPending={createFolderMutation.isPending}
      />
    </div>
  );
}
