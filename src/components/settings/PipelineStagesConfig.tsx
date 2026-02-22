import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Loader2, GripVertical, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Stage {
  id: string;
  name: string;
  position: number;
}

function SortableStage({ stage, onUpdate, onDelete, canDelete }: {
  stage: Stage; onUpdate: (id: string, name: string) => void; onDelete: (id: string) => void; canDelete: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 rounded-lg border bg-background">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        value={stage.name}
        onChange={(e) => onUpdate(stage.id, e.target.value)}
        className="h-8 text-sm flex-1"
      />
      {canDelete && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(stage.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export function PipelineStagesConfig({ pipelineId, pipelineName }: { pipelineId: string; pipelineName: string }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [stages, setStages] = useState<Stage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const originalStagesRef = useRef<Stage[]>([]);

  const { data: queryData, isLoading } = useQuery({
    queryKey: ["pipeline_stages", pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name, position")
        .eq("pipeline_id", pipelineId)
        .order("position");
      if (error) throw error;
      return data as Stage[];
    },
    enabled: !!pipelineId,
  });

  useEffect(() => {
    if (queryData && !hasChanges) {
      setStages(queryData);
      originalStagesRef.current = queryData;
    }
  }, [queryData, hasChanges]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, position: idx }));
      });
      setHasChanges(true);
    }
  }

  const handleUpdate = useCallback((id: string, name: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setHasChanges(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    // For existing stages (not temp), check if opportunities are linked
    if (!id.startsWith("temp-")) {
      const { count, error } = await supabase
        .from("marketing_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("stage_id", id);

      if (!error && count && count > 0) {
        toast.error(`Impossibile rimuovere: ${count} opportunità collegate a questa fase. Spostale prima.`);
        return;
      }
    }

    setStages((prev) => prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, position: idx })));
    setHasChanges(true);
  }, []);

  const handleAdd = useCallback(() => {
    setStages((prev) => [...prev, { id: `temp-${Date.now()}`, name: "Nuova fase", position: prev.length }]);
    setHasChanges(true);
  }, []);

  async function handleSave() {
    if (!companyId) return;
    setIsSaving(true);
    try {
      const original = originalStagesRef.current;
      const originalIds = new Set(original.map((s) => s.id));
      const currentIds = new Set(stages.map((s) => s.id));

      // Stages to delete (in original but not in current)
      const toDelete = original.filter((s) => !currentIds.has(s.id));

      // Check if any stage to delete has linked opportunities
      for (const stage of toDelete) {
        const { count, error } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", stage.id);

        if (!error && count && count > 0) {
          toast.error(`Impossibile eliminare la fase "${stage.name}": ${count} opportunità collegate.`);
          setIsSaving(false);
          return;
        }
      }

      // Delete removed stages
      for (const stage of toDelete) {
        const { error } = await supabase.from("marketing_pipeline_stages").delete().eq("id", stage.id);
        if (error) throw error;
      }

      // Update existing stages (position and name)
      for (const stage of stages) {
        if (originalIds.has(stage.id)) {
          const { error } = await supabase
            .from("marketing_pipeline_stages")
            .update({ name: stage.name, position: stage.position })
            .eq("id", stage.id);
          if (error) throw error;
        }
      }

      // Insert new stages (temp- ids)
      const toInsert = stages
        .filter((s) => s.id.startsWith("temp-"))
        .map((s) => ({
          pipeline_id: pipelineId,
          company_id: companyId,
          name: s.name,
          position: s.position,
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("marketing_pipeline_stages").insert(toInsert);
        if (error) throw error;
      }

      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages", pipelineId] });
      queryClient.invalidateQueries({ queryKey: ["marketing_pipelines", companyId] });
      toast.success("Fasi salvate");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Fasi di "{pipelineName}"</CardTitle>
          <CardDescription>Trascina per riordinare le fasi della pipeline</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" /> Aggiungi Fase
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessuna fase. Aggiungi la prima fase della pipeline.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {stages.map((stage) => (
                  <SortableStage key={stage.id} stage={stage} onUpdate={handleUpdate} onDelete={handleDelete} canDelete={stages.length > 1} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
