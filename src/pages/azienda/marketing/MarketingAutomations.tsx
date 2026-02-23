import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { GlobalWorkflowSettings } from "@/components/marketing/automations/GlobalWorkflowSettings";
import { CreateFolderDialog } from "@/components/email-marketing/CreateFolderDialog";
import { Plus, FolderPlus, Search, SlidersHorizontal, Settings2, Home, ChevronRight, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "workflows" | "settings";
type ListFilterType = "all" | "needs_review" | "deleted";

export default function MarketingAutomations() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<MainTab>("workflows");
  const [listFilter, setListFilter] = useState<ListFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const statusFilter = listFilter === "deleted" ? "archived" : listFilter === "needs_review" ? "draft" : "all";

  // Load current folder ancestors for breadcrumb
  const { data: folderPath } = useQuery({
    queryKey: ["automation-folder-path", currentFolderId],
    queryFn: async () => {
      if (!currentFolderId) return [];
      const path: { id: string; name: string }[] = [];
      let fId: string | null = currentFolderId;
      while (fId) {
        const { data } = await supabase
          .from("automation_folders")
          .select("id, name, parent_id")
          .eq("id", fId)
          .single();
        if (!data) break;
        path.unshift({ id: data.id, name: data.name });
        fId = data.parent_id;
      }
      return path;
    },
    enabled: !!currentFolderId,
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("automation_folders").insert({
        company_id: effectiveCompany!.id,
        name,
        parent_id: currentFolderId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-folders"] });
      toast({ title: "Cartella creata" });
      setFolderDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-0">
      {/* Level 1: Title + main tabs */}
      <div className="border-b">
        <div className="px-1 pt-2">
          <h1 className="text-2xl font-bold mb-3">Automazione</h1>
          <div className="flex gap-6">
            <button
              onClick={() => setMainTab("workflows")}
              className={cn(
                "pb-2.5 text-sm font-medium border-b-2 transition-colors",
                mainTab === "workflows"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Flussi di lavoro
            </button>
            <button
              onClick={() => setMainTab("settings")}
              className={cn(
                "pb-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
                mainTab === "settings"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Impostazioni flusso di lavoro globali
            </button>
          </div>
        </div>
      </div>

      {mainTab === "workflows" ? (
        <div className="space-y-4 pt-4">
          {/* Level 2: Sub-header with actions */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Elenco Flusso di lavoro</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-1.5" /> Crea Cartella
              </Button>
              <Button size="sm" onClick={() => navigate("/azienda/marketing/automazioni/nuova")}>
                <Plus className="h-4 w-4 mr-1.5" /> Crea Flusso di lavoro
              </Button>
            </div>
          </div>

          {/* Level 3: Filter tabs + search */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 border-b">
              {([
                { key: "all", label: "Tutti i flussi di lavoro" },
                { key: "needs_review", label: "Necessita revisione" },
                { key: "deleted", label: "Eliminato" },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setListFilter(f.key)}
                  className={cn(
                    "px-3 pb-2 text-xs font-medium transition-colors border-b-2",
                    listFilter === f.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
              <button
                className={cn(
                  "px-3 pb-2 text-xs font-medium transition-colors border-b-2",
                  showAdvancedFilters
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <span className="flex items-center gap-1"><SlidersHorizontal className="h-3.5 w-3.5" /> Filtri avanzati</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground">
                <ListFilter className="h-3.5 w-3.5 mr-1" /> Personalizza Elenco
              </Button>
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <button onClick={() => setCurrentFolderId(null)} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <Home className="h-3.5 w-3.5" />
              <span>Home</span>
            </button>
            <ChevronRight className="h-3 w-3" />
            {!currentFolderId ? (
              <span className="text-foreground font-medium">Automazione</span>
            ) : (
              <>
                <button onClick={() => setCurrentFolderId(null)} className="hover:text-foreground transition-colors">
                  Automazione
                </button>
                {folderPath?.map((f) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    {f.id === currentFolderId ? (
                      <span className="text-foreground font-medium">{f.name}</span>
                    ) : (
                      <button onClick={() => setCurrentFolderId(f.id)} className="hover:text-foreground transition-colors">
                        {f.name}
                      </button>
                    )}
                  </span>
                ))}
              </>
            )}
          </div>

          {/* Table */}
          <AutomationFlowsList
            statusFilter={statusFilter}
            searchQuery={searchQuery}
            folderId={currentFolderId}
            onNavigateFolder={setCurrentFolderId}
          />
        </div>
      ) : (
        <div className="pt-4">
          <GlobalWorkflowSettings />
        </div>
      )}

      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={(name) => createFolderMutation.mutate(name)}
        isPending={createFolderMutation.isPending}
      />
    </div>
  );
}
