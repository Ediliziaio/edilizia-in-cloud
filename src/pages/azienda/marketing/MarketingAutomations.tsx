import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { GlobalWorkflowSettings } from "@/components/marketing/automations/GlobalWorkflowSettings";
import { CreateFolderDialog } from "@/components/email-marketing/CreateFolderDialog";
import { Plus, FolderPlus, Search, SlidersHorizontal, Settings2, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "workflows" | "settings";
type ListFilterType = "all" | "needs_review" | "deleted";

export default function MarketingAutomations() {
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [mainTab, setMainTab] = useState<MainTab>("workflows");
  const [listFilter, setListFilter] = useState<ListFilterType>(() => {
    const f = searchParams.get("filter");
    if (f === "published") return "all";
    if (f === "draft") return "needs_review";
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const urlFilter = searchParams.get("filter");
  const statusFilter = urlFilter === "published" ? "published" : listFilter === "deleted" ? "archived" : listFilter === "needs_review" ? "draft" : "all";


  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const safeName = name.trim().slice(0, 100);
      if (!safeName) throw new Error("Il nome della cartella non può essere vuoto.");
      const { error } = await supabase.from("automation_folders").insert({
        company_id: effectiveCompany!.id,
        name: safeName,
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
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Elenco Flusso di lavoro</h2>
              {currentFolderId && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground ml-2">
                  <button
                    onClick={() => setCurrentFolderId(null)}
                    className="hover:text-foreground hover:underline transition-colors"
                  >
                    Root
                  </button>
                  <span>/</span>
                  <span className="text-foreground font-medium">Cartella corrente</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentFolderId && (
                <Button variant="ghost" size="sm" onClick={() => setCurrentFolderId(null)}>
                  ← Torna alla root
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-1.5" /> Crea Cartella
              </Button>
              <Button size="sm" onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
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
