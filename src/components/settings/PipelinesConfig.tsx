import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Loader2, MoreHorizontal, Trash2, Pencil, ArrowLeft, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PipelineStagesConfig } from "./PipelineStagesConfig";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const DEFAULT_STAGES = [
  "Nuovo Lead",
  "Contattato",
  "Qualificato",
  "Proposta",
  "Negoziazione",
  "Chiuso Vinto",
  "Chiuso Perso",
];

interface CreateStage {
  id: string;
  name: string;
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
  const [editName, setEditName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: pipelines = [], isLoading } = useQuery({
    queryKey: ["marketing_pipelines", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("*, marketing_pipeline_stages(id, name, position)")
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  function openCreateDialog() {
    setNewName("");
    setCreateStages(DEFAULT_STAGES.map((name, i) => ({ id: `s-${i}-${Date.now()}`, name })));
    setCreateOpen(true);
  }

  function handleAddCreateStage() {
    setCreateStages((prev) => [...prev, { id: `s-${Date.now()}`, name: "Nuova fase" }]);
  }

  function handleUpdateCreateStage(id: string, name: string) {
    setCreateStages((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  function handleRemoveCreateStage(id: string) {
    setCreateStages((prev) => prev.filter((s) => s.id !== id));
  }

  const createPipeline = useMutation({
    mutationFn: async ({ name, stages }: { name: string; stages: string[] }) => {
      // Create pipeline
      const { data: pipeline, error: pipelineError } = await supabase
        .from("marketing_pipelines")
        .insert({ company_id: companyId!, name, position: pipelines.length })
        .select("id")
        .single();
      if (pipelineError) throw pipelineError;

      // Create stages in batch
      if (stages.length > 0) {
        const stagesToInsert = stages.map((stageName, idx) => ({
          pipeline_id: pipeline.id,
          company_id: companyId!,
          name: stageName,
          position: idx,
        }));
        const { error: stagesError } = await supabase.from("marketing_pipeline_stages").insert(stagesToInsert);
        if (stagesError) throw stagesError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_pipelines", companyId] });
      setCreateOpen(false);
      setNewName("");
      setCreateStages([]);
      toast.success("Sequenza creata con le fasi");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updatePipeline = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("marketing_pipelines").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_pipelines", companyId] });
      setEditOpen(false);
      toast.success("Sequenza aggiornata");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_pipelines", companyId] });
      setDeleteOpen(false);
      setDeleteId(null);
      toast.success("Sequenza eliminata");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedPipelineId) {
    const pipeline = pipelines.find((p: any) => p.id === selectedPipelineId);
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
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sequenze (Pipeline)</CardTitle>
            <CardDescription>Gestisci le pipeline di vendita e le relative fasi</CardDescription>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" /> Crea Sequenza
          </Button>
        </CardHeader>
        <CardContent>
          {pipelines.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nessuna sequenza creata</p>
              <p className="text-xs mt-1">Crea la tua prima pipeline di vendita</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pipelines.map((p: any) => (
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
              <label className="text-sm font-medium">Nome della sequenza</label>
              <Input
                placeholder="Es: Pipeline Vendita"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                className="mt-1"
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
                    />
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
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
            <Button
              onClick={() => createPipeline.mutate({
                name: newName,
                stages: createStages.map((s) => s.name).filter((n) => n.trim()),
              })}
              disabled={!newName.trim() || createStages.length === 0 || createPipeline.isPending}
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
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
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
            <AlertDialogDescription>Verranno eliminate anche tutte le fasi e le opportunità associate.</AlertDialogDescription>
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
