import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { GlobalWorkflowSettings } from "@/components/marketing/automations/GlobalWorkflowSettings";
import { Plus, FolderPlus, Sparkles, Search, SlidersHorizontal, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "workflows" | "settings";
type ListFilter = "all" | "needs_review" | "deleted";

export default function MarketingAutomations() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<MainTab>("workflows");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const statusFilter = listFilter === "deleted" ? "archived" : listFilter === "needs_review" ? "draft" : "all";

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
              <Button variant="outline" size="sm">
                <FolderPlus className="h-4 w-4 mr-1.5" /> Crea Cartella
              </Button>
              <Button variant="outline" size="sm">
                <Sparkles className="h-4 w-4 mr-1.5" /> Crea tramite AI
              </Button>
              <Button size="sm" onClick={() => navigate("/azienda/marketing/automazioni/nuova")}>
                <Plus className="h-4 w-4 mr-1.5" /> Crea Flusso di lavoro
              </Button>
            </div>
          </div>

          {/* Level 3: Filter tabs + search */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              {([
                { key: "all", label: "Tutti i flussi di lavoro" },
                { key: "needs_review", label: "Necessita revisione" },
                { key: "deleted", label: "Eliminato" },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setListFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    listFilter === f.key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className={cn("text-xs h-7", showAdvancedFilters && "bg-primary/10 text-primary")}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Filtri avanzati
              </Button>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </div>

          {/* Table */}
          <AutomationFlowsList statusFilter={statusFilter} searchQuery={searchQuery} />
        </div>
      ) : (
        <div className="pt-4">
          <GlobalWorkflowSettings />
        </div>
      )}
    </div>
  );
}
