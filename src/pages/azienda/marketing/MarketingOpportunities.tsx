import { useState, useEffect, useMemo } from "react";
import { Plus, Loader2, Target, Search, Filter, ArrowUpDown, LayoutGrid, List, Upload, MoreHorizontal, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PipelineSelector } from "@/components/opportunities/PipelineSelector";
import { OpportunityKanbanView } from "@/components/opportunities/OpportunityKanbanView";
import { OpportunityDialog } from "@/components/opportunities/OpportunityDialog";
import { OpportunityFiltersSheet, OpportunityFilters, EMPTY_FILTERS, countActiveFilters } from "@/components/opportunities/OpportunityFiltersSheet";
import { usePipelines, useOpportunities, useCompanyStaff } from "@/hooks/useOpportunitiesData";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function MarketingOpportunities() {
  const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const { data: staff = [] } = useCompanyStaff();

  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [pipelines, selectedPipelineId]);

  const selectedPipeline = pipelines.find((p: any) => p.id === selectedPipelineId);
  const stages = selectedPipeline?.marketing_pipeline_stages || [];

  const { data: opportunities = [], isLoading: loadingOpps } = useOpportunities(selectedPipelineId);

  // Collect all unique tags from opportunities
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    opportunities.forEach((o: any) => (o.tags || []).forEach((t: string) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [opportunities]);

  // Combined search + advanced filters
  const filteredOpportunities = useMemo(() => {
    let result = opportunities;

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o: any) => {
        const contact = o.marketing_contacts;
        return (
          o.name?.toLowerCase().includes(q) ||
          contact?.first_name?.toLowerCase().includes(q) ||
          contact?.last_name?.toLowerCase().includes(q) ||
          contact?.email?.toLowerCase().includes(q) ||
          contact?.phone?.toLowerCase().includes(q)
        );
      });
    }

    // Status filter
    if (filters.statuses.length > 0) {
      result = result.filter((o: any) => filters.statuses.includes(o.status));
    }

    // Assigned to
    if (filters.assignedTo) {
      result = result.filter((o: any) => o.assigned_to === filters.assignedTo);
    }

    // Follower
    if (filters.followerId) {
      result = result.filter((o: any) => o.follower_id === filters.followerId);
    }

    // Source
    if (filters.source) {
      const src = filters.source.toLowerCase();
      result = result.filter((o: any) => o.source?.toLowerCase().includes(src));
    }

    // Value range
    if (filters.valueMin) {
      const min = parseFloat(filters.valueMin);
      result = result.filter((o: any) => Number(o.value || 0) >= min);
    }
    if (filters.valueMax) {
      const max = parseFloat(filters.valueMax);
      result = result.filter((o: any) => Number(o.value || 0) <= max);
    }

    // Date range
    if (filters.dateFrom) {
      result = result.filter((o: any) => o.created_at >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((o: any) => o.created_at <= filters.dateTo + "T23:59:59");
    }

    // Tags
    if (filters.tags.length > 0) {
      result = result.filter((o: any) => filters.tags.some((t) => (o.tags || []).includes(t)));
    }

    return result;
  }, [opportunities, searchQuery, filters]);

  const activeFilterCount = countActiveFilters(filters);

  if (loadingPipelines) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <Target className="h-16 w-16 text-muted-foreground/40" />
        <h1 className="text-2xl font-bold">Opportunità</h1>
        <p className="text-muted-foreground max-w-md">
          Per iniziare, crea una sequenza (pipeline) nelle impostazioni sotto "Marketing e Vendita" → "Sequenze".
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/azienda/impostazioni/sequenze"}>
          Vai alle Impostazioni
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Row 1: Pipeline selector + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PipelineSelector
            pipelines={pipelines}
            value={selectedPipelineId}
            onChange={setSelectedPipelineId}
          />
          <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 h-6 px-2 text-xs">
            {filteredOpportunities.length} lead
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vista griglia</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.info("Vista lista in arrivo")}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vista lista</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("Importazione in arrivo")}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Importa
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)} disabled={stages.length === 0}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi opportunità
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info("Esportazione in arrivo")}>Esporta</DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info("Impostazioni in arrivo")}>Impostazioni pipeline</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: Tabs */}
      <div className="flex items-center gap-1 border-b">
        <Button variant="ghost" size="sm" className="h-8 text-xs rounded-none border-b-2 border-primary font-semibold">
          Tutto
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs rounded-none text-muted-foreground" onClick={() => toast.info("Elenchi personalizzati in arrivo")}>
          + Elenco
        </Button>
      </div>

      {/* Row 3: Filters + search */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs relative"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" /> Filtri avanzati
            {activeFilterCount > 0 && (
              <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("Ordinamento in arrivo")}>
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" /> Ordina
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cerca Lead..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
          <Button
            variant="link"
            size="sm"
            className="h-8 text-xs px-1"
            onClick={() => window.location.href = "/azienda/impostazioni/campi-personalizzati"}
          >
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Gestisci campi
          </Button>
        </div>
      </div>

      {/* Kanban */}
      {loadingOpps ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
          <p className="text-sm">Questa pipeline non ha fasi configurate.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/azienda/impostazioni/sequenze"}>
            Configura fasi
          </Button>
        </div>
      ) : (
        <OpportunityKanbanView stages={stages} opportunities={filteredOpportunities} />
      )}

      {/* Create dialog */}
      {selectedPipelineId && stages.length > 0 && (
        <OpportunityDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          pipelineId={selectedPipelineId}
          pipelineName={selectedPipeline?.name}
          stages={stages}
        />
      )}

      {/* Filters Sheet */}
      <OpportunityFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={setFilters}
        staff={staff}
        availableTags={availableTags}
      />
    </div>
  );
}
