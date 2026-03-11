import { useMemo, useState, useCallback, memo, forwardRef } from "react";
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { OpportunityCard } from "./OpportunityCard";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { useUpdateOpportunityStage, useDeleteOpportunity } from "@/hooks/useOpportunitiesData";
import type { OpportunityStage } from "@/types/opportunities";
import { hashColor } from "@/types/opportunities";
import { useCardFieldPreferences } from "@/hooks/useCardFieldPreferences";

const StageColumn = memo(forwardRef<HTMLDivElement, {
  stage: OpportunityStage;
  opportunities: any[];
  onCardClick: (opp: any, tab?: string) => void;
  onDelete: (id: string) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
}>(function StageColumn({ stage, opportunities, onCardClick, onDelete, selectedIds, onSelect }, _ref) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = opportunities.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);

  return (
    <div className="flex flex-col min-w-[280px] max-w-[300px] shrink-0">
      <div className="px-3 py-2.5 border-b bg-muted/60 rounded-t-lg" style={{ borderTopWidth: 3, borderTopColor: hashColor(stage.name) }}>
        <h3 className="text-sm font-bold text-foreground leading-snug">{stage.name}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {opportunities.length} Opportunità · EUR {totalValue.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
        </p>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[200px] rounded-b-lg border border-t-0 transition-colors ${isOver ? "bg-primary/5" : "bg-muted/10"}`}
      >
        <SortableContext items={opportunities.map((o: any) => o.id)} strategy={verticalListSortingStrategy}>
          {opportunities.map((opp: any) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              onClick={() => onCardClick(opp)}
              onOpenTab={(tab) => onCardClick(opp, tab)}
              onDelete={onDelete}
              selected={selectedIds.has(opp.id)}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>
        {opportunities.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Nessuna opportunità</p>
        )}
      </div>
    </div>
  );
}));

interface KanbanProps {
  stages: OpportunityStage[];
  opportunities: any[];
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
}

export function OpportunityKanbanView({ stages, opportunities, selectedIds, onSelect }: KanbanProps) {
  const updateStage = useUpdateOpportunityStage();
  const deleteOpp = useDeleteOpportunity();
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>();
  const [activeItem, setActiveItem] = useState<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const opportunitiesByStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    stages.forEach((s) => { map[s.id] = []; });
    opportunities.forEach((o: any) => {
      if (map[o.stage_id]) map[o.stage_id].push(o);
    });
    return map;
  }, [stages, opportunities]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const opp = opportunities.find((o: any) => o.id === event.active.id);
    if (opp) setActiveItem(opp);
  }, [opportunities]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const activeOpp = opportunities.find((o: any) => o.id === active.id);
    if (!activeOpp) return;

    let targetStageId = over.id as string;
    const overOpp = opportunities.find((o: any) => o.id === over.id);
    if (overOpp) targetStageId = overOpp.stage_id;

    if (activeOpp.stage_id !== targetStageId && stages.some(s => s.id === targetStageId)) {
      const targetStage = stages.find(s => s.id === targetStageId);
      updateStage.mutate({
        id: activeOpp.id,
        stage_id: targetStageId,
        auto_status: targetStage?.auto_status || undefined,
      });
    }
  }, [opportunities, stages, updateStage]);

  const handleDelete = useCallback((id: string) => {
    deleteOpp.mutate(id);
  }, [deleteOpp]);

  return (
    <>
      <div className="w-full overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 p-1 min-w-max">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                opportunities={opportunitiesByStage[stage.id] || []}
                onCardClick={(opp, tab) => { setSelectedOpp(opp); setInitialTab(tab); }}
                onDelete={handleDelete}
                selectedIds={selectedIds}
                onSelect={onSelect}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
            {activeItem ? (
              <div className="opacity-90 rotate-2 scale-105">
                <OpportunityCard opportunity={activeItem} isOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <OpportunityDetailDialog
        opportunity={selectedOpp}
        open={!!selectedOpp}
        onOpenChange={(open) => { if (!open) { setSelectedOpp(null); setInitialTab(undefined); } }}
        stages={stages}
        initialTab={initialTab}
      />
    </>
  );
}
