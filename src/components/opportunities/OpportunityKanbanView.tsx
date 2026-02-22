import { useMemo, useState } from "react";
import {
  DndContext, closestCorners, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { OpportunityCard } from "./OpportunityCard";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { useUpdateOpportunityStage } from "@/hooks/useOpportunitiesData";

interface Stage {
  id: string;
  name: string;
  position: number;
}

function StageColumn({ stage, opportunities, onCardClick }: { stage: Stage; opportunities: any[]; onCardClick: (opp: any) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = opportunities.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);

  return (
    <div className="flex flex-col min-w-[280px] max-w-[300px] shrink-0">
      {/* GHL-style compact header */}
      <div className="px-3 py-2.5 border-b bg-muted/60 rounded-t-lg">
        <h3 className="text-sm font-bold text-foreground leading-snug">{stage.name || "Fase senza nome"}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {opportunities.length} Opportunità · EUR {totalValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
        </p>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[200px] rounded-b-lg border border-t-0 transition-colors ${isOver ? "bg-primary/5" : "bg-muted/10"}`}
      >
        <SortableContext items={opportunities.map((o: any) => o.id)} strategy={verticalListSortingStrategy}>
          {opportunities.map((opp: any) => (
            <OpportunityCard key={opp.id} opportunity={opp} onClick={() => onCardClick(opp)} />
          ))}
        </SortableContext>
        {opportunities.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Nessuna opportunità</p>
        )}
      </div>
    </div>
  );
}

export function OpportunityKanbanView({ stages, opportunities }: { stages: Stage[]; opportunities: any[] }) {
  const updateStage = useUpdateOpportunityStage();
  const [selectedOpp, setSelectedOpp] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const opportunitiesByStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    stages.forEach((s) => { map[s.id] = []; });
    opportunities.forEach((o: any) => {
      if (map[o.stage_id]) map[o.stage_id].push(o);
    });
    return map;
  }, [stages, opportunities]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeOpp = opportunities.find((o: any) => o.id === active.id);
    if (!activeOpp) return;

    let targetStageId = over.id as string;
    const overOpp = opportunities.find((o: any) => o.id === over.id);
    if (overOpp) targetStageId = overOpp.stage_id;

    if (activeOpp.stage_id !== targetStageId && stages.some(s => s.id === targetStageId)) {
      updateStage.mutate({ id: activeOpp.id, stage_id: targetStageId });
    }
  }

  return (
    <>
      <div className="w-full overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 p-1 min-w-max">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                opportunities={opportunitiesByStage[stage.id] || []}
                onCardClick={setSelectedOpp}
              />
            ))}
          </div>
        </DndContext>
      </div>

      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) setSelectedOpp(null); }}
        stages={stages}
      />
    </>
  );
}
