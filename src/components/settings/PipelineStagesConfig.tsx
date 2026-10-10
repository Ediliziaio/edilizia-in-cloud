import { useState } from "react";
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
import { queryKeys } from "@/lib/queryKeys";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";

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

function SortableStage({ stage, indice, onUpdate, onDelete, canDelete, onAutoStatusChange, onSalesOSChange }: {
  stage: Stage;
  indice: number;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
  onAutoStatusChange: (id: string, status: string | null) => void;
  onSalesOSChange: (id: string, field: 'win_probability' | 'stalled_threshold_days', value: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const esito = AUTO_STATUS_OPTIONS.find((o) => o.value === (stage.auto_status || "none"));
  const idEsito = `fase-esito-${stage.id}`;
  const idAiutoEsito = `fase-esito-aiuto-${stage.id}`;
  const idFerma = `fase-ferma-${stage.id}`;
  const idProbabilita = `fase-probabilita-${stage.id}`;

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background p-2 space-y-2">
      {/* Riga principale: maniglia, nome, cestino */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Trascina la fase ${indice + 1} per cambiare l'ordine`}
          className="inline-flex cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground max-md:h-11 max-md:w-11"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input
          value={stage.name}
          onChange={(e) => onUpdate(stage.id, e.target.value)}
          aria-label={`Nome della fase ${indice + 1}`}
          className="h-9 min-w-0 flex-1 text-sm max-md:h-11"
          maxLength={100}
        />
        {canDelete && (
          <Button aria-label={`Elimina la fase «${stage.name}»`} variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive max-md:h-11 max-md:w-11" onClick={() => onDelete(stage.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {/* Cosa succede quando una trattativa arriva qui: la frase dell'opzione scelta sta sempre sotto, non nel solo title */}
      <div className="space-y-1 sm:pl-10">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label htmlFor={idEsito} className="text-xs text-muted-foreground">Quando una trattativa arriva qui diventa…</label>
          <Select
            value={stage.auto_status || "none"}
            onValueChange={(v) => onAutoStatusChange(stage.id, v === "none" ? null : v)}
          >
            <SelectTrigger id={idEsito} className="h-8 w-[140px] text-xs max-md:h-11" aria-describedby={idAiutoEsito}>
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              {/* Il testo esteso sta nel title e non fra i children: shadcn passa
                  i children a ItemText, che finisce anche nel trigger stretto. */}
              {AUTO_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} title={opt.hint}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p id={idAiutoEsito} className="text-xs text-muted-foreground">{esito?.hint}</p>
      </div>
      {/* Riga Sales OS */}
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:items-center sm:pl-10">
        <label htmlFor={idProbabilita} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span>Prob. vittoria %</span>
          <Input
            id={idProbabilita}
            type="number"
            value={stage.win_probability ?? ""}
            onChange={(e) => onSalesOSChange(stage.id, "win_probability", normalizeNumber(e.target.value, 0, 100))}
            className="h-8 w-full text-xs sm:h-7 sm:w-[72px] max-md:h-11"
            min={0}
            max={100}
          />
        </label>
        <label htmlFor={idFerma} className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
          <span>Ferma da (giorni)</span>
          <Input
            id={idFerma}
            type="number"
            title="Dopo quanti giorni nella fase una trattativa risulta ferma."
            value={stage.stalled_threshold_days ?? ""}
            onChange={(e) =>
              onSalesOSChange(
                stage.id,
                "stalled_threshold_days",
                normalizeNumber(e.target.value, 1)
              )
            }
            className="h-8 w-full text-xs sm:h-7 sm:w-[72px] max-md:h-11"
            min={1}
          />
        </label>
      </div>
    </div>
  );
}

export function PipelineStagesConfig({ pipelineId, pipelineName }: { pipelineId: string; pipelineName: string }) {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && permissions.canEditSettingsCustomization;
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const chiaveFasi = ["pipeline_stages", pipelineId, companyId] as const;

  const { data: queryData, isLoading, isError, error, refetch } = useQuery({
    queryKey: chiaveFasi,
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

  // Le fasi come sono nel database; la bozza (`null` = nessuna modifica) le sostituisce finché non si salva. Così, se un
  // salvataggio riesce a metà, basta rileggere il database: la bozza resta, e «salvate» è sempre com'è davvero.
  const salvate: Stage[] = queryData ?? [];
  const [bozza, setBozza] = useState<Stage[] | null>(null);
  const stages = bozza ?? salvate;
  const hasChanges = bozza !== null;
  useSettingsDraftGuard(hasChanges || isSaving);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** Applica una modifica alla bozza (partendo dalle fasi salvate se ancora non ce n'è una). */
  const modifica = (cambia: (fasi: Stage[]) => Stage[]) => setBozza((corrente) => cambia(corrente ?? salvate));

  function handleDragEnd(event: DragEndEvent) {
    if (!puoModificare || isSaving) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      modifica((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return items;
        return arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, position: idx }));
      });
    }
  }

  const handleUpdate = (id: string, name: string) => modifica((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));

  const handleAutoStatusChange = (id: string, auto_status: string | null) =>
    modifica((prev) => prev.map((s) => (s.id === id ? { ...s, auto_status } : s)));

  const handleSalesOSChange = (id: string, field: 'win_probability' | 'stalled_threshold_days', value: number | null) =>
    modifica((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));

  const handleDelete = async (id: string) => {
    if (!puoModificare || isSaving) return;
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

      if (error) { toast.error("Impossibile verificare le opportunità collegate. Riprova."); return; }
      if (count && count > 0) {
        toast.error(`Impossibile rimuovere: ${count} opportunità collegate a questa fase. Spostale prima.`);
        return;
      }
    }

    modifica((prev) => prev.filter((s) => s.id !== id).map((s, idx) => ({ ...s, position: idx })));
  };

  const handleAdd = () => modifica((prev) => [...prev, {
    id: `temp-${Date.now()}`,
    name: "Nuova fase",
    position: prev.length,
    auto_status: null,
    win_probability: null,
    stalled_threshold_days: 14,
  }]);

  async function handleSave() {
    if (!companyId || !puoModificare || isSaving || isError) return;
    setIsSaving(true);
    // Quante scritture sono già andate a buon fine: se una successiva fallisce, il database è cambiato a metà.
    let scritte = 0;
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

      const original = salvate;
      const originalIds = new Set(original.map((s) => s.id));
      const currentIds = new Set(normalizedStages.map((s) => s.id));

      const toDelete = original.filter((s) => !currentIds.has(s.id));

      for (const stage of toDelete) {
        const { count, error } = await supabase
          .from("marketing_opportunities")
          .select("id", { count: "exact", head: true })
          .eq("stage_id", stage.id)
          .eq("company_id", companyId);

        if (error) throw error;
        if (count && count > 0) {
          toast.error(`Impossibile eliminare la fase "${stage.name}": ${count} opportunità collegate.`);
          setIsSaving(false);
          return;
        }
      }

      for (const stage of toDelete) {
        const { error } = await supabase.from("marketing_pipeline_stages").delete().eq("id", stage.id).eq("company_id", companyId!).select("id").single();
        if (error) throw error;
        scritte++;
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
            .eq("company_id", companyId).select("id").single();
          if (error) throw error;
          scritte++;
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
        scritte++;
      }

      // Si rilegge prima di togliere la bozza: le fasi nuove hanno il loro id vero e non c'è un momento con l'elenco vecchio.
      await queryClient.refetchQueries({ queryKey: chiaveFasi });
      setBozza(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
      // Anche il Kanban mantiene le fasi in cache: deve rileggere subito nomi,
      // ordine e nuove colonne quando si torna alle opportunità.
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: ["bulk-opp-stages", pipelineId] });
      toast.success("Fasi salvate");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
      if (scritte > 0) {
        // Il salvataggio è fatto di più scritture una dopo l'altra: se una fallisce, quelle prima sono già nel database.
        // Si rilegge l'elenco (la bozza resta com'è) così «Salva le fasi» riparte da come sono le fasi adesso.
        toast.warning("Una parte delle modifiche era già stata salvata. Ho riletto le fasi: controlla e premi «Salva le fasi» di nuovo.");
        void queryClient.refetchQueries({ queryKey: chiaveFasi });
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.pipelines.list(companyId) });
      }
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
          <Button variant="outline" onClick={() => refetch()} className="max-md:h-11">
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Fasi di «{pipelineName}»</CardTitle>
          <CardDescription>Trascina per cambiare l'ordine. La prima fase è dove entrano i nuovi contatti dei moduli.</CardDescription>
        </div>
        {puoModificare && (
          <Button disabled={isSaving} variant="outline" size="sm" onClick={handleAdd} className="max-md:h-11">
            <Plus className="mr-2 h-4 w-4" /> Aggiungi una fase
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!puoModificare && (
          <AvvisoSolaLettura>
            Sola lettura: per modificare le fasi serve il permesso «Modifica» su Personalizzazione.
          </AvvisoSolaLettura>
        )}
        <p className="text-xs text-muted-foreground">
          «Prob. vittoria %» si salva, ma oggi non entra nelle statistiche: il valore «ponderato» di Opportunità usa la probabilità
          di ogni singola opportunità.
        </p>
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessuna fase. Aggiungi la prima fase della pipeline.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {/* Senza permesso di modifica il fieldset spegne campi, menu,
                  cestino e maniglia di trascinamento in un colpo solo. */}
              <fieldset disabled={!puoModificare || isSaving} className="m-0 min-w-0 space-y-2 border-0 p-0">
                {stages.map((stage, indice) => (
                  <SortableStage
                    key={stage.id}
                    stage={stage}
                    indice={indice}
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
        {/* La barra del salvataggio resta in vista: con una decina di fasi il pulsante in cima usciva dallo schermo. */}
        {puoModificare && (hasChanges || isSaving) && (
          <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-2 rounded-b-lg border-t bg-card px-6 py-3">
            <span role="status" className="text-sm text-muted-foreground">Modifiche non salvate</span>
            <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving} className="max-md:h-11">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva le fasi
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
