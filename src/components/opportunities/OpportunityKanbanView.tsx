import { useMemo, useState, useCallback, memo, forwardRef, useRef } from "react";
import {
  DndContext, pointerWithin, rectIntersection, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay,
  type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { OpportunityCard } from "./OpportunityCard";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { OpportunityDetailDialog } from "./OpportunityDetailDialog";
import { useUpdateOpportunityStage, useDeleteOpportunity } from "@/hooks/useOpportunitiesData";
import type { OpportunityStage } from "@/types/opportunities";
import { hashColor, inferOpportunityStatusFromStage } from "@/types/opportunities";
import { useCardFieldPreferences } from "@/hooks/useCardFieldPreferences";

const StageColumn = memo(forwardRef<HTMLDivElement, {
  stage: OpportunityStage;
  opportunities: any[];
  onCardClick: (opp: any, tab?: string) => void;
  onDelete: (id: string) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectMany?: (ids: string[], selected: boolean) => void;
  canEdit?: boolean;
  onQuickAdd?: (stageId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: (stageId: string) => void;
}>(function StageColumn({ stage, opportunities, onCardClick, onDelete, selectedIds, onSelect, onSelectMany, canEdit = true, onQuickAdd, collapsed = false, onToggleCollapse }, _ref) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const { layout } = useCardFieldPreferences();
  const totalValue = opportunities.reduce((sum: number, o: any) => sum + Number(o.value || 0), 0);
  const avgValue = opportunities.length > 0 ? totalValue / opportunities.length : 0;

  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: opportunities.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (layout === "mini" ? 52 : 180),
    overscan: 5,
    gap: 8,
  });

  // Riepilogo selezione della fase (per checkbox select-all e header).
  const stageOppIds = opportunities.map((o: any) => o.id);
  const selectedInStage = stageOppIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = stageOppIds.length > 0 && selectedInStage === stageOppIds.length;
  const someSelected = selectedInStage > 0 && !allSelected;

  // Colonna collassata: barra verticale sottile stile GHL. Resta droppabile:
  // trascinando una card sopra si sposta comunque in questa fase.
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        onClick={() => onToggleCollapse?.(stage.id)}
        title={`Espandi "${stage.name}"`}
        className={cn(
          "flex flex-col items-center shrink-0 w-11 h-[calc(100svh-310px)] md:h-[calc(100vh-280px)] rounded-lg border bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer",
          isOver && "bg-primary/10 border-primary border-dashed"
        )}
        style={{ borderTopWidth: 3, borderTopColor: hashColor(stage.name) }}
      >
        <button
          type="button"
          aria-label={`Espandi ${stage.name}`}
          className="mt-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mt-1 text-[10px] font-semibold bg-background rounded-full px-1.5 py-0.5 text-muted-foreground">
          {opportunities.length}
        </span>
        <span className="mt-2 text-xs font-bold text-foreground" style={{ writingMode: "vertical-rl" }}>
          {stage.name}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col shrink-0 h-[calc(100svh-310px)] md:h-[calc(100vh-280px)]", layout === "mini" ? "min-w-[200px] md:min-w-[220px] max-w-[240px] md:max-w-[260px]" : "min-w-[240px] md:min-w-[280px] max-w-[270px] md:max-w-[300px]")}>
      <div className="px-3 py-2.5 border-b bg-muted/60 rounded-t-lg shrink-0" style={{ borderTopWidth: 3, borderTopColor: hashColor(stage.name) }}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {canEdit && onSelectMany && opportunities.length > 0 && (
              // Select-all della fase (stile GHL): checkbox nell'intestazione colonna.
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(v) => onSelectMany(stageOppIds, v === true)}
                aria-label={`Seleziona tutte le opportunità in ${stage.name}`}
                className="h-3.5 w-3.5 shrink-0"
              />
            )}
            <h3 className="text-sm font-bold text-foreground leading-snug truncate">{stage.name}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-semibold bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">{opportunities.length}</span>
            {canEdit && onQuickAdd && (
              // Quick-add con fase pre-selezionata (standard kanban CRM):
              // prima l'unico "Aggiungi" era globale in header.
              <button
                type="button"
                title={`Aggiungi opportunità in "${stage.name}"`}
                onClick={() => onQuickAdd(stage.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors text-sm leading-none"
              >
                +
              </button>
            )}
            {onToggleCollapse && (
              // Freccia per comprimere la colonna (stile GHL).
              <button
                type="button"
                title={`Comprimi "${stage.name}"`}
                onClick={() => onToggleCollapse(stage.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {selectedInStage > 0 ? (
          <p className="text-[11px] font-medium text-primary mt-0.5">
            {selectedInStage} selezionat{selectedInStage === 1 ? "a" : "e"} · {formatCurrency(totalValue)}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatCurrency(totalValue)} tot · {formatCurrency(avgValue)} avg
          </p>
        )}
      </div>
      <div
        ref={(node) => {
          setNodeRef(node);
          (scrollRef as any).current = node;
        }}
        className={cn(
          "flex-1 p-2 rounded-b-lg border-2 border-t-0 transition-all overflow-y-auto",
          "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40",
          // Visual aggressivo durante drag-over: ring colorato + bg blu + scale leggero
          isOver
            ? "bg-primary/10 border-primary border-dashed scale-[1.01] shadow-inner"
            : "bg-muted/10 border-transparent"
        )}
      >
        <SortableContext items={opportunities.map((o: any) => o.id)} strategy={verticalListSortingStrategy}>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const opp = opportunities[virtualRow.index];
              return (
                <div
                  key={opp.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                >
                  <OpportunityCard
                    opportunity={opp}
                    onClick={() => onCardClick(opp)}
                    onOpenTab={(tab) => onCardClick(opp, tab)}
                    onDelete={onDelete}
                    selected={selectedIds.has(opp.id)}
                    onSelect={onSelect}
                    canEdit={canEdit}
                  />
                </div>
              );
            })}
          </div>
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
  onSelectMany?: (ids: string[], selected: boolean) => void;
  canEdit?: boolean;
  onQuickAdd?: (stageId: string) => void;
}

const COLLAPSED_STAGES_KEY = "opp-kanban-collapsed-stages";

export function OpportunityKanbanView({ stages, opportunities, selectedIds, onSelect, onSelectMany, canEdit = true, onQuickAdd }: KanbanProps) {
  const updateStage = useUpdateOpportunityStage();
  const deleteOpp = useDeleteOpportunity();
  const [selectedOpp, setSelectedOpp] = useState<any>(null);
  const [initialTab, setInitialTab] = useState<string | undefined>();
  const [activeItem, setActiveItem] = useState<any>(null);

  // Fasi collassate: persistite in localStorage così restano tali al reload.
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_STAGES_KEY);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleCollapse = useCallback((stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
      try { localStorage.setItem(COLLAPSED_STAGES_KEY, JSON.stringify([...next])); } catch { /* storage non disponibile */ }
      return next;
    });
  }, []);

  const sensors = useSensors(
    // Desktop: distance 5px è il minimo che evita click accidentali — sotto si
    // attivava drag su semplice click. Tuned per ridurre "lag percepito".
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Mobile: 180ms long-press + tolerance 8px. 200ms era ai limiti per
    // distinguere tap vs drag — 180ms più reattivo. Tolerance 8 evita drag
    // accidentali durante scroll verticale della colonna.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Collision detection custom: usa pointerWithin (più stabile per kanban
  // multi-colonna con scroll orizzontale), fallback a rectIntersection se il
  // puntatore esce dal viewport (es. scroll auto bordi).
  // closestCorners (default precedente) era impreciso con colonne strette
  // affiancate — droppava nella colonna sbagliata.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  }, []);

  const opportunitiesByStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    stages.forEach((s) => { map[s.id] = []; });
    opportunities.forEach((o: any) => {
      if (map[o.stage_id]) map[o.stage_id].push(o);
    });
    return map;
  }, [stages, opportunities]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (!canEdit) return;
    const opp = opportunities.find((o: any) => o.id === event.active.id);
    if (opp) setActiveItem(opp);
  }, [opportunities, canEdit]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveItem(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over) return;

    const activeOpp = opportunities.find((o: any) => o.id === active.id);
    if (!activeOpp) return;

    let targetStageId = over.id as string;
    const overOpp = opportunities.find((o: any) => o.id === over.id);
    if (overOpp) targetStageId = overOpp.stage_id;

    if (activeOpp.stage_id !== targetStageId && stages.some(s => s.id === targetStageId)) {
      const targetStage = stages.find(s => s.id === targetStageId);
      const nextStatus = inferOpportunityStatusFromStage(targetStage, "open");
      updateStage.mutate({
        id: activeOpp.id,
        stage_id: targetStageId,
        auto_status: nextStatus,
      });
    }
  }, [opportunities, stages, updateStage, canEdit]);

  const handleDelete = useCallback((id: string) => {
    if (!canEdit) return;
    deleteOpp.mutate(id);
  }, [deleteOpp, canEdit]);

  return (
    <>
      <div className="w-full h-full overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
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
                onSelectMany={onSelectMany}
                canEdit={canEdit}
                onQuickAdd={onQuickAdd}
                collapsed={collapsedStages.has(stage.id)}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>
          {/* dropAnimation null: la card non "vola indietro" al rilascio — l'update
              ottimistico la posiziona subito nella nuova colonna (drop snappy). */}
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              // Card "in volo": rotazione + ombra forte + ring colorato = feedback chiaro
              <div className="rotate-2 scale-105 shadow-2xl ring-2 ring-primary rounded-md cursor-grabbing">
                <OpportunityCard opportunity={activeItem} isOverlay canEdit={canEdit} />
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
        canEdit={canEdit}
      />
    </>
  );
}
