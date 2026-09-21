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
import { Plus, Loader2, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUTO_STATUS_OPTIONS } from "@/types/opportunities";
import { usePermissions } from "@/hooks/usePermissions";
import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";

interface Stage {
  id: string;
  name: string;
  position: number;
  auto_status: string | null;
  // SO6: Sales OS fields
  win_probability: number | null;
  stalled_threshold_days: number | null;
}

type StageUpdatePayload = {
  name: string;
  position: number;
  auto_status: string | null;
  win_probability: number | null;
  stalled_threshold_days: number | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasDuplicateStageNames(stages: Stage[]) {
  const seen = new Set<string>();
  for (const stage of stages) {
    const name = normalizeName(stage.name).toLowerCase();
    if (!name) continue;
    if (seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}

function normalizeNumber(value: string, min: number, max?: number) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(Math.max(parsed, min), max ?? parsed);
}

function SortableStage({ stage, onUpdate, onDelete, canDelete, onAutoStatusChange, onSalesOSChange }: {
  stage: Stage;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  onAutoStatusChange: (id: string, status: string | null) => void;
  onSalesOSChange: (id: string, field: 'win_probability' | 'stalled_threshold_days', value: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background p-2 space-y-1">
      {/* Riga principale */}
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} aria-label="Trascina per riordinare" className="cursor-grab text-muted-foreground hover:text-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        <Input
          value={stage.name}
          onChange={(e) => onUpdate(stage.id, e.target.value)}
          className="h-8 text-sm flex-1"
          maxLength={100}
        />
        <Select
          value={stage.auto_status || "none"}
          onValueChange={(v) => onAutoStatusChange(stage.id, v === "none" ? null : v)}
        >
          <SelectTrigger
            className="h-8 text-xs w-[130px]"
            title={AUTO_STATUS_OPTIONS.find((o) => o.value === (stage.auto_status || "none"))?.hint}
          >
            <SelectValue placeholder="Stato auto" />
          </SelectTrigger>
          <SelectContent>
            {/* Il testo esteso sta nel title e non fra i children: shadcn passa
                i children a ItemText, che finisce anche nel trigger stretto. */}
            {AUTO_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} title={opt.hint}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(stage.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {/* Riga Sales OS */}
      <div className="flex items-center gap-3 pl-8 text-xs text-muted-foreground">
        <span>Prob. win %</span>
        <Input
          type="number"
          value={stage.win_probability ?? ""}
          onChange={(e) => onSalesOSChange(stage.id, "win_probability", normalizeNumber(e.target.value, 0, 100))}
          className="h-7 text-xs w-[72px]"
          min={0}
          max={100}
        />
        <span>Alert ferma (gg)</span>
        <Input
          type="number"
          value={stage.stalled_threshold_days ?? ""}
          onChange={(e) =>
            onSalesOSChange(
              stage.id,
              "stalled_threshold_days",
              normalizeNumber(e.target.value, 1)
            )
          }
          className="h-7 text-xs w-[72px]"
          min={1}
        />
      </div>
    </div>
  );
}

export function PipelineStagesConfig({ pipelineId, pipelineName }: { pipelineId: string; pipelineName: string }) {
  const { effectiveCompany } = useAuth();
  const { canEditSettingsCustomization: puoModificare } = usePermissions();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [stages, setStages] = useState<Stage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const originalStagesRef = useRef<Stage[]>([]);

  const { data: queryData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pipeline_stages", pipelineId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name, position, auto_status, win_probability, stalled_threshold_days")
        .eq("pipeline_id", pipelineId)
        .eq("company_id", companyId)
        .order("position");
      if (error) throw error;
      return data as Stage[];
    },
    enabled: !!pipelineId && !!companyId,
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
        if (oldIndex < 0 || newIndex < 0) return items;
        return arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, position: idx }));
      });
      setHasChanges(true);
    }
  }

  const handleUpdate = useCallback((id: string, name: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setHasChanges(true);
  }, []);

  const handleAutoStatusChange = useCallback((id: string, auto_status: string | null) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, auto_status } : s)));
    setHasChanges(true);
  }, []);

  const handleSalesOSChange = useCallback((id: string, field: 'win_probability' | 'stalled_threshold_days', value: number | null) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    setHasChanges(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!companyId) {
      toast.error("Azienda non disponibile. Ricarica la pagina e riprova.");
      return;
    }

    if (!id.startsWith("temp-")) {
      const { count, error } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", id)
          .eq("company_id", companyId);

      if (!error && count && count > 0) {
        toast.error(`Impossibile rimuovere: ${count} opportunità collegate a questa fase. Spostale prima.`);
        return;
      }
    }

    setStages((prev) => prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, position: idx })));
    setHasChanges(true);
  }, [companyId]);

  const handleAdd = useCallback(() => {
    setStages((prev) => [...prev, {
      id: `temp-${Date.now()}`,
      name: "Nuova fase",
      position: prev.length,
      auto_status: null,
      win_probability: null,
      stalled_threshold_days: 14,
    }]);
    setHasChanges(true);
  }, []);

  async function handleSave() {
    if (!companyId) return;
    setIsSaving(true);
    try {
      const normalizedStages = stages
        .map((stage, idx) => ({ ...stage, name: normalizeName(stage.name), position: idx }))
        .filter((stage) => stage.name);

      if (normalizedStages.length === 0) {
        toast.error("Aggiungi almeno una fase valida prima di salvare.");
        setIsSaving(false);
        return;
      }

      if (hasDuplicateStageNames(normalizedStages)) {
        toast.error("Le fasi non possono avere nomi duplicati.");
        setIsSaving(false);
        return;
      }

      const original = originalStagesRef.current;
      const originalIds = new Set(original.map((s) => s.id));
      const currentIds = new Set(normalizedStages.map((s) => s.id));

      const toDelete = original.filter((s) => !currentIds.has(s.id));

      for (const stage of toDelete) {
        const { count, error } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", stage.id)
          .eq("company_id", companyId);

        if (!error && count && count > 0) {
          toast.error(`Impossibile eliminare la fase "${stage.name}": ${count} opportunità collegate.`);
          setIsSaving(false);
          return;
        }
      }

      for (const stage of toDelete) {
        const { error } = await supabase.from("marketing_pipeline_stages").delete().eq("id", stage.id).eq("company_id", companyId!);
        if (error) throw error;
      }

      for (const stage of normalizedStages) {
        if (originalIds.has(stage.id)) {
          const { error } = await supabase
            .from("marketing_pipeline_stages")
            .update({
              name: stage.name,
              position: stage.position,
              auto_status: stage.auto_status,
              win_probability: stage.win_probability,
              stalled_threshold_days: stage.stalled_threshold_days,
            } satisfies StageUpdatePayload)
            .eq("id", stage.id)
            .eq("company_id", companyId);
          if (error) throw error;
        }
      }

      const toInsert = normalizedStages
        .filter((s) => s.id.startsWith("temp-"))
        .map((s) => ({
          pipeline_id: pipelineId,
          company_id: companyId,
          name: s.name,
          position: s.position,
          auto_status: s.auto_status,
          win_probability: s.win_probability,
          stalled_threshold_days: s.stalled_threshold_days,
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("marketing_pipeline_stages").insert(toInsert);
        if (error) throw error;
      }

      setHasChanges(false);
      setStages(normalizedStages);
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages", pipelineId] });
      queryClient.invalidateQueries({ queryKey: ["marketing_pipelines", companyId] });
      toast.success("Fasi salvate");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fasi non disponibili</CardTitle>
          <CardDescription>{getErrorMessage(error)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => refetch()}>
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Fasi di "{pipelineName}"</CardTitle>
          <CardDescription>Trascina per riordinare. Associa uno stato automatico per aggiornare le opportunità.</CardDescription>
        </div>
        {puoModificare && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" /> Aggiungi Fase
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!puoModificare && (
          <AvvisoSolaLettura>
            Sola lettura: per modificare le fasi serve il permesso «Modifica» su Personalizzazione.
          </AvvisoSolaLettura>
        )}
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessuna fase. Aggiungi la prima fase della pipeline.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {/* Senza permesso di modifica il fieldset spegne campi, menu,
                  cestino e maniglia di trascinamento in un colpo solo. */}
              <fieldset disabled={!puoModificare} className="min-w-0 space-y-2">
                {stages.map((stage) => (
                  <SortableStage
                    key={stage.id}
                    stage={stage}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    canDelete={stages.length > 1}
                    onAutoStatusChange={handleAutoStatusChange}
                    onSalesOSChange={handleSalesOSChange}
                  />
                ))}
              </fieldset>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
