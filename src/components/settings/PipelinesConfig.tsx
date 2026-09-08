import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Loader2, MoreHorizontal, Trash2, Pencil, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PipelineStagesConfig } from "./PipelineStagesConfig";
import { AUTO_STATUS_OPTIONS } from "@/types/opportunities";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PipelineRow = {
  id: string;
  name: string;
  updated_at: string;
  marketing_pipeline_stages?: { id: string; name: string; position: number }[] | null;
};

interface CreateStage {
  id: string;
  name: string;
  auto_status: string | null;
}

type PipelineTemplate = {
  id: string;
  label: string;
  description: string;
  defaultName: string;
  stages: { name: string; auto_status: string | null }[];
};

// Modelli di partenza per la creazione di una sequenza. Il primo e' quello
// applicato all'apertura del dialog, quindi resta il comportamento storico.
// Le fasi restano completamente modificabili dopo aver scelto il modello.
//
// Sui nomi: NON possono ripetersi dentro lo stesso modello, la create li
// rifiuta (hasDuplicateNames). Sugli auto_status: "abandoned" e non "lost"
// per le squalifiche (fuori zona, non qualificato) — sono lead che non sono
// mai diventati trattative, contarli come persi sporca il tasso di chiusura.
const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "standard",
    label: "Pipeline standard",
    description: "Il percorso classico dal lead alla chiusura.",
    defaultName: "Pipeline Vendita",
    stages: [
      { name: "Nuovo Lead", auto_status: null },
      { name: "Contattato", auto_status: null },
      { name: "Qualificato", auto_status: null },
      { name: "Proposta", auto_status: null },
      { name: "Negoziazione", auto_status: null },
      { name: "Chiuso Vinto", auto_status: "won" },
      { name: "Chiuso Perso", auto_status: "lost" },
    ],
  },
  {
    id: "vendita-edile",
    label: "Vendita edile (completa)",
    description: "Copre i casi reali del commerciale: mancate risposte, richiami, fuori zona.",
    defaultName: "Vendita Edile",
    stages: [
      { name: "Da Contattare", auto_status: null },
      { name: "Non Risponde", auto_status: null },
      { name: "Da Richiamare più Avanti", auto_status: null },
      { name: "Appuntamento Fissato", auto_status: null },
      { name: "In Trattativa", auto_status: null },
      { name: "Contratto Firmato", auto_status: "won" },
      { name: "Contratto Perso", auto_status: "lost" },
      { name: "Fuori Zona", auto_status: "abandoned" },
      { name: "N° Sbagliato", auto_status: "abandoned" },
      { name: "Non Qualificato", auto_status: "abandoned" },
    ],
  },
  {
    id: "sopralluogo-preventivo",
    label: "Sopralluogo e preventivo",
    description: "Per chi vende su misura: il preventivo parte solo dopo il sopralluogo.",
    defaultName: "Sopralluoghi e Preventivi",
    stages: [
      { name: "Richiesta Ricevuta", auto_status: null },
      { name: "Sopralluogo da Fissare", auto_status: null },
      { name: "Sopralluogo Fissato", auto_status: null },
      { name: "Preventivo da Inviare", auto_status: null },
      { name: "Preventivo Inviato", auto_status: null },
      { name: "Preventivo Accettato", auto_status: "won" },
      { name: "Preventivo Rifiutato", auto_status: "lost" },
    ],
  },
];

function buildStagesFromTemplate(template: PipelineTemplate): CreateStage[] {
  const stamp = Date.now();
  return template.stages.map((stage, idx) => ({
    id: `s-${idx}-${stamp}`,
    name: stage.name,
    auto_status: stage.auto_status,
  }));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

class PipelineInUseError extends Error {
  constructor(public readonly count: number) {
    // Il conteggio non filtra per stato: un'opportunita' archiviata resta
    // collegata alla sequenza. Il messaggio diceva "spostale o archiviale" e
    // mandava in un vicolo cieco chi provava ad archiviare.
    super(
      count === 1
        ? "Questa sequenza ha 1 opportunità collegata. Spostala in un'altra sequenza o eliminala: archiviarla non basta, resta collegata."
        : `Questa sequenza ha ${count} opportunità collegate. Spostale in un'altra sequenza o eliminale: archiviarle non basta, restano collegate.`
    );
    this.name = "PipelineInUseError";
  }
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasDuplicateNames(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeName(value).toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) return true;
    seen.add(normalized);
  }
  return false;
}

export function PipelinesConfig() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [createStages, setCreateStages] = useState<CreateStage[]>([]);
  const [templateId, setTemplateId] = useState(PIPELINE_TEMPLATES[0].id);
  const [editName, setEditName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const validCreateStages = createStages.filter((stage) => normalizeName(stage.name));
  const createHasDuplicateStages = hasDuplicateNames(createStages.map((stage) => stage.name));
  const activeTemplate = PIPELINE_TEMPLATES.find((t) => t.id === templateId);

  const { data: pipelines = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.pipelinesConfig.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("*, marketing_pipeline_stages(id, name, position)")
        .eq("company_id", companyId)
        .order("position");
      if (error) throw error;
      return data as PipelineRow[];
    },
    enabled: !!companyId,
  });

  function openCreateDialog() {
    setTemplateId(PIPELINE_TEMPLATES[0].id);
    setNewName("");
    setCreateStages(buildStagesFromTemplate(PIPELINE_TEMPLATES[0]));
    setCreateOpen(true);
  }

  function applyTemplate(id: string) {
    const template = PIPELINE_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    setTemplateId(id);
    setCreateStages(buildStagesFromTemplate(template));
    // Il nome digitato dall'utente non va perso: lo sovrascrivo solo se e'
    // vuoto o se e' ancora quello suggerito da un altro modello.
    setNewName((prev) => {
      const current = normalizeName(prev);
      const isUntouched = !current || PIPELINE_TEMPLATES.some((t) => t.defaultName === current);
      return isUntouched ? template.defaultName : prev;
    });
  }

  function handleAddCreateStage() {
    setCreateStages((prev) => [...prev, { id: `s-${Date.now()}`, name: "Nuova fase", auto_status: null }]);
  }

  function handleUpdateCreateStage(id: string, name: string) {
    setCreateStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function handleRemoveCreateStage(id: string) {
    setCreateStages((prev) => prev.filter((s) => s.id !== id));
  }

  const createPipeline = useMutation({
    mutationFn: async ({ name, stages }: { name: string; stages: CreateStage[] }) => {
      if (!companyId) throw new Error("Azienda non disponibile. Ricarica la pagina e riprova.");
      const cleanName = normalizeName(name);
      const cleanStages = stages
        .map((stage) => ({ ...stage, name: normalizeName(stage.name) }))
        .filter((stage) => stage.name);

      if (!cleanName) throw new Error("Inserisci il nome della sequenza.");
      if (cleanStages.length === 0) throw new Error("Aggiungi almeno una fase valida.");
      if (hasDuplicateNames(cleanStages.map((stage) => stage.name))) {
        throw new Error("Le fasi non possono avere nomi duplicati.");
      }
      if (pipelines.some((pipeline) => normalizeName(pipeline.name).toLowerCase() === cleanName.toLowerCase())) {
        throw new Error("Esiste gia una sequenza con questo nome.");
      }

      const { data: pipeline, error: pipelineError } = await supabase
        .from("marketing_pipelines")
        .insert({ company_id: companyId, name: cleanName, position: pipelines.length })
        .select("id")
        .single();
      if (pipelineError) throw pipelineError;

      if (cleanStages.length > 0) {
        const stagesToInsert = cleanStages.map((s, idx) => ({
          pipeline_id: pipeline.id,
          company_id: companyId,
          name: s.name,
          position: idx,
          auto_status: s.auto_status,
        }));
        const { error: stagesError } = await supabase.from("marketing_pipeline_stages").insert(stagesToInsert);
        if (stagesError) throw stagesError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
      setCreateOpen(false);
      setNewName("");
      setCreateStages([]);
      toast.success("Sequenza creata con le fasi");
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const updatePipeline = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!companyId) throw new Error("Azienda non disponibile. Ricarica la pagina e riprova.");
      const cleanName = normalizeName(name);
      if (!cleanName) throw new Error("Inserisci il nome della sequenza.");
      if (pipelines.some((pipeline) => pipeline.id !== id && normalizeName(pipeline.name).toLowerCase() === cleanName.toLowerCase())) {
        throw new Error("Esiste gia una sequenza con questo nome.");
      }

      const { error } = await supabase.from("marketing_pipelines").update({ name: cleanName }).eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
      setEditOpen(false);
      toast.success("Sequenza aggiornata");
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile. Ricarica la pagina e riprova.");
      const { count, error: countError } = await supabase
        .from("marketing_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("pipeline_id", id);
      if (countError) throw countError;
      if ((count ?? 0) > 0) throw new PipelineInUseError(count ?? 0);

      const { error } = await supabase.from("marketing_pipelines").delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pipelinesConfig.list(companyId) });
      setDeleteOpen(false);
      setDeleteId(null);
      toast.success("Sequenza eliminata");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof PipelineInUseError ? e.message : getErrorMessage(e));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sequenze non disponibili</CardTitle>
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

  if (selectedPipelineId) {
    const pipeline = pipelines.find((p) => p.id === selectedPipelineId);
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setSelectedPipelineId(null)}>
          <ArrowLeft className="h-4 w-4" /> Torna alle sequenze
        </Button>
        <PipelineStagesConfig pipelineId={selectedPipelineId} pipelineName={pipeline?.name || ""} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          {/* v8.6.74 — flex-wrap mobile-safe */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Sequenze (Pipeline)</CardTitle>
              <CardDescription>Gestisci le pipeline di vendita e le relative fasi</CardDescription>
            </div>
            <Button size="sm" onClick={openCreateDialog} className="w-full sm:w-auto shrink-0">
              <Plus className="mr-2 h-4 w-4" /> Crea Sequenza
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {pipelines.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nessuna sequenza creata</p>
              <p className="text-xs mt-1">Crea la tua prima pipeline di vendita</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pipelines.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setSelectedPipelineId(p.id)}
                >
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.marketing_pipeline_stages?.length || 0} fasi · Aggiornata {format(new Date(p.updated_at), "dd MMM yyyy", { locale: it })}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditId(p.id); setEditName(p.name); setEditOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Rinomina
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); setDeleteOpen(true); }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog with default stages */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuova Sequenza</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Parti da un modello</label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {activeTemplate?.description} Puoi modificare, aggiungere o eliminare le fasi qui sotto.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Nome della sequenza</label>
              <Input
                placeholder="Es: Pipeline Vendita"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                className="mt-1"
                maxLength={100}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Fasi della pipeline</label>
                <Button variant="outline" size="sm" onClick={handleAddCreateStage} type="button">
                  <Plus className="mr-1 h-3 w-3" /> Aggiungi
                </Button>
              </div>
              <div className="space-y-2">
                {createStages.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 text-center">{idx + 1}</span>
                    <Input
                      value={stage.name}
                      onChange={(e) => handleUpdateCreateStage(stage.id, e.target.value)}
                      className="h-8 text-sm flex-1"
                      maxLength={100}
                    />
                    <Select
                      value={stage.auto_status || "none"}
                      onValueChange={(v) => setCreateStages((prev) => prev.map((s) => s.id === stage.id ? { ...s, auto_status: v === "none" ? null : v } : s))}
                    >
                      <SelectTrigger
                        className="h-8 text-xs w-[120px]"
                        title={AUTO_STATUS_OPTIONS.find((o) => o.value === (stage.auto_status || "none"))?.hint}
                      >
                        <SelectValue placeholder="Stato" />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTO_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} title={opt.hint}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {createStages.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleRemoveCreateStage(stage.id)}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {createStages.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nessuna fase. Aggiungi almeno una fase.</p>
                )}
                {createHasDuplicateStages && (
                  <p className="text-xs text-destructive pt-1">
                    Ci sono due fasi con lo stesso nome. Rinominane una per poter creare la sequenza.
                  </p>
                )}
              </div>
              <div className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground space-y-1">
                <p>
                  La tendina a destra decide lo stato dell'opportunità quando entra nella fase.
                  Usa <span className="font-medium text-foreground">Persa</span> solo per le trattative
                  fatte e perse, e <span className="font-medium text-foreground">Abbandonata</span> per
                  chi non è mai diventato trattativa (numero sbagliato, fuori zona, non qualificato):
                  così il tasso di chiusura resta reale.
                </p>
                <p>
                  Per far partire un'automazione su una singola fase non serve lo stato: le regole
                  scattano già sul cambio di fase.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
            <Button
              onClick={() => createPipeline.mutate({
                name: newName,
                stages: validCreateStages,
              })}
              disabled={!normalizeName(newName) || validCreateStages.length === 0 || createHasDuplicateStages || createPipeline.isPending}
            >
              {createPipeline.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Crea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rinomina Sequenza</DialogTitle></DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus maxLength={100} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
            <Button onClick={() => editId && updatePipeline.mutate({ id: editId, name: editName })} disabled={!editName.trim() || updatePipeline.isPending}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa sequenza?</AlertDialogTitle>
            <AlertDialogDescription>
              L'eliminazione è consentita solo se non ci sono opportunità collegate, nemmeno archiviate. Le fasi verranno rimosse insieme alla sequenza.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deletePipeline.mutate(deleteId)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
