import { useState, useEffect } from "react";
import { Plus, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PipelineSelector } from "@/components/opportunities/PipelineSelector";
import { OpportunityKanbanView } from "@/components/opportunities/OpportunityKanbanView";
import { OpportunityDialog } from "@/components/opportunities/OpportunityDialog";
import { usePipelines, useOpportunities } from "@/hooks/useOpportunitiesData";

export default function MarketingOpportunities() {
  const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Auto-select first pipeline
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [pipelines, selectedPipelineId]);

  const selectedPipeline = pipelines.find((p: any) => p.id === selectedPipelineId);
  const stages = selectedPipeline?.marketing_pipeline_stages || [];

  const { data: opportunities = [], isLoading: loadingOpps } = useOpportunities(selectedPipelineId);

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
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <PipelineSelector
            pipelines={pipelines}
            value={selectedPipelineId}
            onChange={setSelectedPipelineId}
          />
          <Badge variant="secondary" className="h-7 px-2.5">
            {opportunities.length} opportunità
          </Badge>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={stages.length === 0}>
          <Plus className="mr-2 h-4 w-4" /> Aggiungi opportunità
        </Button>
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
        <OpportunityKanbanView stages={stages} opportunities={opportunities} />
      )}

      {/* Create dialog */}
      {selectedPipelineId && stages.length > 0 && (
        <OpportunityDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          pipelineId={selectedPipelineId}
          stages={stages}
        />
      )}
    </div>
  );
}
