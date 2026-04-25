import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, ListChecks, Pencil, Copy, Eye, Search,
  GripVertical, Loader2, Save, CheckCircle2, Users2, Activity,
  ArrowLeft, Sparkles, TrendingUp, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ============================================================================
// Types
// ============================================================================

interface Template {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

interface Step {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_required: boolean;
  auto_check_key: string | null;
}

interface TemplateStats {
  id: string;
  assigned: number;   // Aziende che hanno questo template
  completed: number;  // Aziende che l'hanno completato
}

interface StepCompletionCount {
  step_id: string;
  completions: number;
}

/** Catalogo auto-check keys riconosciute dal sistema — curato, non free text */
const AUTO_CHECK_KEYS = [
  { value: "has_customers", label: "Ha almeno un cliente", hint: "profiles.company_id.count > 0" },
  { value: "has_orders", label: "Ha almeno un ordine", hint: "orders.company_id.count > 0" },
  { value: "has_staff", label: "Ha almeno un dipendente", hint: "user_roles.company_staff.count > 0" },
  { value: "has_logo", label: "Ha caricato il logo", hint: "companies.logo_url IS NOT NULL" },
  { value: "has_subscription", label: "Ha piano attivo", hint: "status = 'active'" },
  { value: "has_payment_method", label: "Ha metodo di pagamento", hint: "stripe_customer_id IS NOT NULL" },
  { value: "has_invoice", label: "Ha emesso prima fattura", hint: "invoices.company_id.count > 0" },
  { value: "has_quote", label: "Ha creato un preventivo", hint: "quotes.company_id.count > 0" },
  { value: "has_supplier", label: "Ha almeno un fornitore", hint: "suppliers.company_id.count > 0" },
  { value: "has_appointment", label: "Ha creato un appuntamento", hint: "appointments.company_id.count > 0" },
] as const;

// ============================================================================
// Page
// ============================================================================

export default function AdminOnboardingConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<Template | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<Template | null>(null);
  const [deleteStepTarget, setDeleteStepTarget] = useState<Step | null>(null);
  const [editStep, setEditStep] = useState<Step | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [search, setSearch] = useState("");

  // DnD sensors — hook al top-level (non condizionale) per Rules of Hooks
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ─── Queries ────────────────────────────────────────────

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: queryKeys.admin.onboardingTemplates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates" as never)
        .select("id, name, description, is_default, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Template[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: steps = [], isLoading: loadingSteps } = useQuery({
    queryKey: queryKeys.admin.onboardingSteps(selectedTemplateId),
    enabled: !!selectedTemplateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps" as never)
        .select("id, template_id, title, description, sort_order, is_required, auto_check_key")
        .eq("template_id", selectedTemplateId as never)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Step[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Stats aggregate: quante aziende usano ciascun template
  const { data: templateStats = [] } = useQuery({
    queryKey: ["admin-onboarding-template-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_onboarding" as never)
        .select("template_id, status");
      if (error) throw error;
      const byTpl = new Map<string, { assigned: number; completed: number }>();
      for (const r of (data ?? []) as Array<{ template_id: string; status: string }>) {
        if (!byTpl.has(r.template_id)) byTpl.set(r.template_id, { assigned: 0, completed: 0 });
        const v = byTpl.get(r.template_id)!;
        v.assigned++;
        if (r.status === "completed") v.completed++;
      }
      return Array.from(byTpl.entries()).map(([id, s]) => ({ id, ...s })) as TemplateStats[];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Stats step-level per il template selezionato
  const { data: stepCompletions = [] } = useQuery({
    queryKey: ["admin-onboarding-step-completions", selectedTemplateId],
    enabled: !!selectedTemplateId && steps.length > 0,
    queryFn: async () => {
      const stepIds = steps.map((s) => s.id);
      const { data, error } = await supabase
        .from("company_onboarding_completions" as never)
        .select("step_id")
        .in("step_id" as never, stepIds as never);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ step_id: string }>) {
        counts.set(r.step_id, (counts.get(r.step_id) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([step_id, completions]) => ({ step_id, completions })) as StepCompletionCount[];
    },
    staleTime: 2 * 60 * 1000,
  });

  // Lookup maps
  const statsById = useMemo(() => {
    const m = new Map<string, TemplateStats>();
    templateStats.forEach(s => m.set(s.id, s));
    return m;
  }, [templateStats]);

  const completionsByStep = useMemo(() => {
    const m = new Map<string, number>();
    stepCompletions.forEach(c => m.set(c.step_id, c.completions));
    return m;
  }, [stepCompletions]);

  const maxCompletions = useMemo(
    () => Math.max(1, ...stepCompletions.map(c => c.completions)),
    [stepCompletions],
  );

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  // Filter
  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  // Global KPI
  const globalStats = useMemo(() => {
    const totalTemplates = templates.length;
    const defaultSet = templates.some(t => t.is_default);
    const totalAssignments = templateStats.reduce((s, r) => s + r.assigned, 0);
    const totalCompleted = templateStats.reduce((s, r) => s + r.completed, 0);
    const completionRate = totalAssignments > 0 ? Math.round((totalCompleted / totalAssignments) * 100) : null;
    return { totalTemplates, defaultSet, totalAssignments, totalCompleted, completionRate };
  }, [templates, templateStats]);

  // If selected template is deleted, reset selection
  useEffect(() => {
    if (selectedTemplateId && !templates.find(t => t.id === selectedTemplateId)) {
      setSelectedTemplateId(null);
    }
  }, [templates, selectedTemplateId]);

  // ─── Mutations ──────────────────────────────────────────

  const createTemplate = useMutation({
    mutationFn: async (payload: {
      name: string;
      description: string | null;
      cloneFromId?: string;
      seedSteps?: Array<Omit<Step, "id" | "template_id">>;
    }) => {
      const { data: inserted, error } = await supabase
        .from("onboarding_templates" as never)
        .insert({
          name: payload.name,
          description: payload.description,
          is_default: templates.length === 0,
          created_by: user!.id,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const newTemplateId = (inserted as { id: string }).id;

      // Clone steps se richiesto
      if (payload.cloneFromId && inserted) {
        const { data: sourceSteps } = await supabase
          .from("onboarding_steps" as never)
          .select("title, description, sort_order, is_required, auto_check_key")
          .eq("template_id", payload.cloneFromId as never)
          .order("sort_order");

        if (sourceSteps && sourceSteps.length > 0) {
          const newStepsPayload = (sourceSteps as never[]).map((s) => ({
            ...(s as Record<string, unknown>),
            template_id: newTemplateId,
          }));
          const { error: insertErr } = await supabase
            .from("onboarding_steps" as never)
            .insert(newStepsPayload as never);
          if (insertErr) throw insertErr;
        }
      }

      // Seed steps dal prefab library (mutuamente esclusivo con cloneFromId)
      if (payload.seedSteps && payload.seedSteps.length > 0) {
        const rows = payload.seedSteps.map((s, i) => ({
          template_id: newTemplateId,
          title: s.title,
          description: s.description,
          sort_order: i,
          is_required: s.is_required,
          auto_check_key: s.auto_check_key,
        }));
        const { error: insertErr } = await supabase
          .from("onboarding_steps" as never)
          .insert(rows as never);
        if (insertErr) throw insertErr;
      }
      return newTemplateId;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingTemplates });
      setShowNewTemplate(false);
      setDuplicateSource(null);
      setSelectedTemplateId(newId);
      toast.success("Template creato");
    },
    onError: (err: Error) => toast.error(err.message || "Errore creazione template"),
  });

  const updateTemplate = useMutation({
    mutationFn: async (payload: { id: string; name: string; description: string | null }) => {
      const { error } = await supabase
        .from("onboarding_templates" as never)
        .update({ name: payload.name, description: payload.description } as never)
        .eq("id", payload.id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingTemplates });
      setEditTemplate(null);
      toast.success("Template aggiornato");
    },
    onError: (err: Error) => toast.error(err.message || "Errore aggiornamento"),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_templates" as never)
        .delete()
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingTemplates });
      if (selectedTemplateId === deleteTemplateTarget?.id) setSelectedTemplateId(null);
      setDeleteTemplateTarget(null);
      toast.success("Template eliminato");
    },
    onError: (err: Error) => toast.error(err.message || "Errore eliminazione"),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      // Non atomico ma accettabile: target attivato per ultimo
      const { error: clearErr } = await supabase
        .from("onboarding_templates" as never)
        .update({ is_default: false } as never)
        .neq("id", id as never);
      if (clearErr) throw clearErr;
      const { error: setErr } = await supabase
        .from("onboarding_templates" as never)
        .update({ is_default: true } as never)
        .eq("id", id as never);
      if (setErr) throw setErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingTemplates });
      toast.success("Template predefinito aggiornato");
    },
    onError: (err: Error) => toast.error(err.message || "Errore"),
  });

  const addStep = useMutation({
    mutationFn: async (payload: Omit<Step, "id" | "template_id">) => {
      if (!selectedTemplateId) throw new Error("Nessun template selezionato");
      const { error } = await supabase
        .from("onboarding_steps" as never)
        .insert({
          template_id: selectedTemplateId,
          title: payload.title,
          description: payload.description,
          sort_order: payload.sort_order,
          is_required: payload.is_required,
          auto_check_key: payload.auto_check_key,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingSteps(selectedTemplateId) });
      toast.success("Step aggiunto");
    },
    onError: (err: Error) => toast.error(err.message || "Errore aggiunta step"),
  });

  const updateStep = useMutation({
    mutationFn: async (payload: { id: string; title: string; description: string | null; is_required: boolean; auto_check_key: string | null }) => {
      const { error } = await supabase
        .from("onboarding_steps" as never)
        .update({
          title: payload.title,
          description: payload.description,
          is_required: payload.is_required,
          auto_check_key: payload.auto_check_key,
        } as never)
        .eq("id", payload.id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingSteps(selectedTemplateId) });
      setEditStep(null);
      toast.success("Step aggiornato");
    },
    onError: (err: Error) => toast.error(err.message || "Errore aggiornamento"),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("onboarding_steps" as never)
        .delete()
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingSteps(selectedTemplateId) });
      setDeleteStepTarget(null);
      toast.success("Step eliminato");
    },
    onError: (err: Error) => toast.error(err.message || "Errore eliminazione"),
  });

  // Reorder steps (atomic via Promise.all di UPDATE individuali)
  const reorderSteps = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase
          .from("onboarding_steps" as never)
          .update({ sort_order: index } as never)
          .eq("id", id as never)
      );
      const results = await Promise.all(updates);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) throw firstErr.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.onboardingSteps(selectedTemplateId) });
    },
    onError: (err: Error) => toast.error(err.message || "Errore riordino"),
  });

  // ─── Handlers ───────────────────────────────────────────

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex(s => s.id === active.id);
    const newIndex = steps.findIndex(s => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(steps, oldIndex, newIndex);
    // Optimistic update
    queryClient.setQueryData(
      queryKeys.admin.onboardingSteps(selectedTemplateId),
      reordered.map((s, i) => ({ ...s, sort_order: i })),
    );
    reorderSteps.mutate(reordered.map(s => s.id));
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold hidden md:block">Customer Success — Onboarding</h1>
          <p className="text-muted-foreground text-sm hidden md:block">
            Template di onboarding guidato per le aziende clienti. Scegli il flusso, gli step, le auto-verifiche.
          </p>
        </div>
        <Button onClick={() => setShowNewTemplate(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Template
        </Button>
      </div>

      {/* KPI */}
      <KpiOverview stats={globalStats} loading={loadingTemplates} />

      {/* Master-detail layout */}
      <div className={cn(
        "grid gap-4",
        selectedTemplate ? "lg:grid-cols-[360px_1fr]" : "grid-cols-1",
      )}>
        {/* Left column — template list */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca template…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadingTemplates && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
          )}

          {!loadingTemplates && templates.length === 0 && (
            <EmptyState onCreate={() => setShowNewTemplate(true)} />
          )}

          {!loadingTemplates && templates.length > 0 && filteredTemplates.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Nessun template per "{search}"</p>
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>Reset</Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {filteredTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                stats={statsById.get(t.id)}
                selected={selectedTemplateId === t.id}
                onSelect={() => setSelectedTemplateId(t.id)}
                onEdit={() => setEditTemplate(t)}
                onDuplicate={() => setDuplicateSource(t)}
                onDelete={() => setDeleteTemplateTarget(t)}
                onSetDefault={() => setDefault.mutate(t.id)}
                onPreview={() => setPreviewTemplate(t)}
              />
            ))}
          </div>
        </div>

        {/* Right column — editor */}
        {selectedTemplate && (
          <div>
            <StepsEditor
              template={selectedTemplate}
              steps={steps}
              loading={loadingSteps}
              completionsByStep={completionsByStep}
              maxCompletions={maxCompletions}
              sensorsSetup={dndSensors}
              onClose={() => setSelectedTemplateId(null)}
              onDragEnd={handleDragEnd}
              onAddStep={(payload) => addStep.mutate(payload)}
              addingStep={addStep.isPending}
              onEditStep={(s) => setEditStep(s)}
              onDeleteStep={(s) => setDeleteStepTarget(s)}
              onToggleRequired={(s, val) =>
                updateStep.mutate({
                  id: s.id,
                  title: s.title,
                  description: s.description,
                  is_required: val,
                  auto_check_key: s.auto_check_key,
                })
              }
            />
          </div>
        )}
      </div>

      {/* Dialogs */}
      <NewTemplateDialog
        open={showNewTemplate}
        onOpenChange={setShowNewTemplate}
        onCreate={(payload) => createTemplate.mutate(payload)}
        creating={createTemplate.isPending}
      />

      {duplicateSource && (
        <DuplicateTemplateDialog
          source={duplicateSource}
          open={!!duplicateSource}
          onOpenChange={(open) => !open && setDuplicateSource(null)}
          onDuplicate={(name) =>
            createTemplate.mutate({
              name,
              description: duplicateSource.description
                ? `${duplicateSource.description} (copia)`
                : "Copia di " + duplicateSource.name,
              cloneFromId: duplicateSource.id,
            })
          }
          creating={createTemplate.isPending}
        />
      )}

      {editTemplate && (
        <EditTemplateDialog
          template={editTemplate}
          open={!!editTemplate}
          onOpenChange={(open) => !open && setEditTemplate(null)}
          onSave={(payload) => updateTemplate.mutate(payload)}
          saving={updateTemplate.isPending}
        />
      )}

      {editStep && (
        <EditStepDialog
          step={editStep}
          open={!!editStep}
          onOpenChange={(open) => !open && setEditStep(null)}
          onSave={(payload) => updateStep.mutate(payload)}
          saving={updateStep.isPending}
        />
      )}

      {previewTemplate && (
        <PreviewDialog
          template={previewTemplate}
          templateId={previewTemplate.id}
          open={!!previewTemplate}
          onOpenChange={(open) => !open && setPreviewTemplate(null)}
        />
      )}

      {/* Confirm delete template */}
      <AlertDialog
        open={!!deleteTemplateTarget}
        onOpenChange={(open) => !open && setDeleteTemplateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare "{deleteTemplateTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Il template e tutti i suoi step verranno rimossi definitivamente.
              {deleteTemplateTarget && statsById.get(deleteTemplateTarget.id)?.assigned ? (
                <> <strong>{statsById.get(deleteTemplateTarget.id)?.assigned}</strong> aziende stanno usando questo template.</>
              ) : null}
              {" "}Operazione irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTemplateTarget && deleteTemplate.mutate(deleteTemplateTarget.id)}
            >
              Elimina template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete step */}
      <AlertDialog
        open={!!deleteStepTarget}
        onOpenChange={(open) => !open && setDeleteStepTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare step "{deleteStepTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Lo step verrà rimosso dal template. Completamenti storici delle aziende
              che l'avevano già superato restano nel log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteStepTarget && deleteStep.mutate(deleteStepTarget.id)}
            >
              Elimina step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Subcomponenti
// ============================================================================

function KpiOverview({
  stats,
  loading,
}: {
  stats: { totalTemplates: number; defaultSet: boolean; totalAssignments: number; totalCompleted: number; completionRate: number | null };
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatPill
        icon={<ListChecks className="h-4 w-4" />}
        label="Template totali"
        value={stats.totalTemplates}
        subtitle={stats.defaultSet ? "1 impostato come default" : "⚠️ Nessun default"}
        accent="bg-primary/10 text-primary"
        warning={!stats.defaultSet && stats.totalTemplates > 0}
      />
      <StatPill
        icon={<Users2 className="h-4 w-4" />}
        label="Aziende in onboarding"
        value={stats.totalAssignments}
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      />
      <StatPill
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Completati"
        value={stats.totalCompleted}
        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <StatPill
        icon={<TrendingUp className="h-4 w-4" />}
        label="Completion rate"
        value={stats.completionRate !== null ? `${stats.completionRate}%` : "—"}
        subtitle={stats.totalAssignments > 0 ? `${stats.totalCompleted}/${stats.totalAssignments}` : "nessun assegnamento"}
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
    </div>
  );
}

function StatPill({
  icon, label, value, subtitle, accent, warning,
}: {
  icon: React.ReactNode; label: string; value: string | number; subtitle?: string; accent: string; warning?: boolean;
}) {
  return (
    <Card className={cn(warning && "ring-1 ring-amber-400")}>
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <div className="max-w-sm">
          <h3 className="font-semibold">Nessun template di onboarding</h3>
          <p className="text-sm text-muted-foreground mt-1">
            I template guidano le nuove aziende attraverso i passi iniziali: caricare il logo, importare clienti, creare il primo ordine.
          </p>
        </div>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> Crea il primo template
        </Button>
      </CardContent>
    </Card>
  );
}

function TemplateCard({
  template, stats, selected,
  onSelect, onEdit, onDuplicate, onDelete, onSetDefault, onPreview,
}: {
  template: Template;
  stats: TemplateStats | undefined;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onPreview: () => void;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        selected && "ring-2 ring-primary border-primary",
      )}
      onClick={onSelect}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{template.name}</span>
              {template.is_default && <Badge variant="default" className="text-[10px] h-5">Default</Badge>}
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
            )}
          </div>
        </div>

        {stats && stats.assigned > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Users2 className="h-3 w-3" />
            <span>{stats.assigned} aziende</span>
            <span>·</span>
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>{stats.completed} completati</span>
          </div>
        )}

        <div className="flex items-center gap-1 pt-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Anteprima" onClick={(e) => { e.stopPropagation(); onPreview(); }}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplica" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Modifica" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Elimina" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {!template.is_default && (
            <Button variant="outline" size="sm" className="ml-auto h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); onSetDefault(); }}>
              Imposta default
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Steps editor ------------------------------------------------------------

function StepsEditor({
  template, steps, loading, completionsByStep, maxCompletions,
  sensorsSetup, onClose, onDragEnd, onAddStep, addingStep,
  onEditStep, onDeleteStep, onToggleRequired,
}: {
  template: Template;
  steps: Step[];
  loading: boolean;
  completionsByStep: Map<string, number>;
  maxCompletions: number;
  sensorsSetup: ReturnType<typeof useSensors>;
  onClose: () => void;
  onDragEnd: (e: DragEndEvent) => void;
  onAddStep: (p: Omit<Step, "id" | "template_id">) => void;
  addingStep: boolean;
  onEditStep: (s: Step) => void;
  onDeleteStep: (s: Step) => void;
  onToggleRequired: (s: Step, val: boolean) => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAutoKey, setNewAutoKey] = useState<string>("__none__");
  const [newRequired, setNewRequired] = useState(false);

  const canAdd = newTitle.trim().length > 0 && !addingStep;

  function handleAdd() {
    if (!canAdd) return;
    onAddStep({
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      sort_order: steps.length,
      is_required: newRequired,
      auto_check_key: newAutoKey && newAutoKey !== "__none__" ? newAutoKey : null,
    });
    setNewTitle("");
    setNewDesc("");
    setNewAutoKey("__none__");
    setNewRequired(false);
  }

  return (
    <Card>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {steps.length} {steps.length === 1 ? "step" : "step"} · {steps.filter(s => s.is_required).length} obbligatori
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Steps list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-md" />)}
          </div>
        ) : steps.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nessuno step. Aggiungine uno qui sotto.
          </div>
        ) : (
          <DndContext sensors={sensorsSetup} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <SortableStepRow
                    key={step.id}
                    step={step}
                    index={i}
                    completions={completionsByStep.get(step.id) ?? 0}
                    maxCompletions={maxCompletions}
                    onEdit={() => onEditStep(step)}
                    onDelete={() => onDeleteStep(step)}
                    onToggleRequired={(val) => onToggleRequired(step, val)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add step form */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Aggiungi nuovo step</h4>
            {steps.length === 0 && (
              <Badge variant="outline" className="text-[10px]">Il primo step</Badge>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="text-xs">Titolo *</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Es. Importa i tuoi clienti"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Descrizione</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Opzionale — cosa deve fare l'utente"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Verifica automatica</Label>
              <Select value={newAutoKey} onValueChange={setNewAutoKey}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Manuale (checkbox utente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Manuale (checkbox utente)</SelectItem>
                  {AUTO_CHECK_KEYS.map(k => (
                    <SelectItem key={k.value} value={k.value}>
                      <span className="flex flex-col">
                        <span>{k.label}</span>
                        <span className="text-[10px] text-muted-foreground">{k.value}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch id="new-step-required" checked={newRequired} onCheckedChange={setNewRequired} />
                <Label htmlFor="new-step-required" className="text-sm cursor-pointer">
                  Step obbligatorio (blocca chi non lo completa)
                </Label>
              </div>
              <Button onClick={handleAdd} disabled={!canAdd} size="sm">
                {addingStep ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Aggiungi
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableStepRow({
  step, index, completions, maxCompletions,
  onEdit, onDelete, onToggleRequired,
}: {
  step: Step;
  index: number;
  completions: number;
  maxCompletions: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRequired: (val: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const completionPct = maxCompletions > 0 ? (completions / maxCompletions) * 100 : 0;
  const autoKeyMeta = AUTO_CHECK_KEYS.find(k => k.value === step.auto_check_key);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 p-3 rounded-lg border bg-card",
        isDragging && "opacity-60 shadow-lg z-10",
      )}
    >
      <button
        type="button"
        className="touch-none text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
        aria-label="Trascina per riordinare"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="h-6 w-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{step.title}</span>
          {step.is_required && <Badge variant="outline" className="text-[10px] h-4 border-amber-400 text-amber-700">obbligatorio</Badge>}
          {autoKeyMeta ? (
            <Badge variant="outline" className="text-[10px] h-4 border-blue-300 text-blue-700" title={autoKeyMeta.hint}>
              auto: {autoKeyMeta.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">manuale</Badge>
          )}
        </div>
        {step.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{step.description}</p>
        )}
        {/* Completion bar (se ci sono dati reali) */}
        {completions > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden max-w-[200px]">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, completionPct)}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {completions} completati
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
        <Switch
          checked={step.is_required}
          onCheckedChange={onToggleRequired}
          className="scale-75"
          aria-label="Obbligatorio"
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Modifica">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Elimina">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// --- Dialogs -----------------------------------------------------------------

// ─── Library di template prebuilt per quick-start ─────────────────────────

type LibraryTemplate = {
  id: string;
  name: string;
  description: string;
  sector: string;
  steps: Array<Omit<Step, "id" | "template_id" | "sort_order">>;
};

const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  {
    id: "serramenti_standard",
    name: "Onboarding Serramenti",
    description: "5 step per aziende di serramenti: setup, catalogo, primo cliente, preventivo, ordine",
    sector: "Serramenti",
    steps: [
      { title: "Carica il logo aziendale", description: "Personalizza l'aspetto del gestionale con il tuo brand.", is_required: false, auto_check_key: "has_logo" },
      { title: "Importa il listino dei fornitori", description: "Importa articoli serramenti da Excel o PDF per usarli nei preventivi.", is_required: true, auto_check_key: null },
      { title: "Aggiungi il primo cliente", description: "Manualmente o importando da Excel.", is_required: true, auto_check_key: "has_customers" },
      { title: "Crea il primo preventivo", description: "Usa il builder preventivi con il tuo catalogo.", is_required: false, auto_check_key: "has_quote" },
      { title: "Genera il primo ordine", description: "Converti il preventivo in ordine di produzione.", is_required: true, auto_check_key: "has_orders" },
    ],
  },
  {
    id: "fotovoltaico_completo",
    name: "Onboarding Fotovoltaico",
    description: "6 step completi per installatori fotovoltaici: GSE, sopralluogo, progettazione, ordine materiale, installazione",
    sector: "Fotovoltaico",
    steps: [
      { title: "Carica il logo aziendale", description: "Brand personalizzato sui documenti.", is_required: false, auto_check_key: "has_logo" },
      { title: "Configura la tua prima sede operativa", description: "Per geolocalizzare gli interventi.", is_required: true, auto_check_key: null },
      { title: "Aggiungi i primi dipendenti / tecnici", description: "Staff che gestirà cantieri e sopralluoghi.", is_required: true, auto_check_key: "has_staff" },
      { title: "Aggiungi il primo cliente", description: "Cliente finale per il quale attivare il progetto.", is_required: true, auto_check_key: "has_customers" },
      { title: "Crea il primo ordine fotovoltaico", description: "Moduli, inverter, accumulo, progettazione.", is_required: true, auto_check_key: "has_orders" },
      { title: "Attiva un fornitore principale", description: "Per tracciare acquisti e ODA.", is_required: false, auto_check_key: "has_supplier" },
    ],
  },
  {
    id: "bagni_ristrutturazioni",
    name: "Onboarding Bagni/Ristrutturazioni",
    description: "5 step per aziende di ristrutturazioni: setup, clienti, preventivo, ordine, fatturazione",
    sector: "Ristrutturazioni",
    steps: [
      { title: "Imposta la tua azienda (P.IVA, PEC, SDI)", description: "Per emettere fatture elettroniche.", is_required: true, auto_check_key: null },
      { title: "Importa il tuo elenco clienti", description: "Con nome, email, telefono e indirizzo.", is_required: true, auto_check_key: "has_customers" },
      { title: "Configura il metodo di pagamento", description: "Stripe o bonifico per ricevere pagamenti.", is_required: true, auto_check_key: "has_payment_method" },
      { title: "Crea il primo preventivo completo", description: "Con misurazioni, materiali e manodopera.", is_required: false, auto_check_key: "has_quote" },
      { title: "Emetti la prima fattura", description: "A fine lavori o per acconto.", is_required: false, auto_check_key: "has_invoice" },
    ],
  },
  {
    id: "generico_base",
    name: "Onboarding Generico (Base)",
    description: "4 step minimi universali per qualsiasi tipo di azienda",
    sector: "Generico",
    steps: [
      { title: "Carica il logo", description: "Personalizza il gestionale.", is_required: false, auto_check_key: "has_logo" },
      { title: "Aggiungi almeno un cliente", description: "Manualmente o via import.", is_required: true, auto_check_key: "has_customers" },
      { title: "Crea il primo ordine", description: "Anche vuoto, solo per iniziare.", is_required: true, auto_check_key: "has_orders" },
      { title: "Configura il metodo di pagamento", description: "Per incassare online.", is_required: false, auto_check_key: "has_payment_method" },
    ],
  },
  {
    id: "completo_premium",
    name: "Onboarding Completo Premium",
    description: "10 step per aziende che sfruttano tutte le feature (CRM, ordini, fatture, fornitori, calendario)",
    sector: "Premium",
    steps: [
      { title: "Carica il logo aziendale", description: "Brand identity.", is_required: false, auto_check_key: "has_logo" },
      { title: "Configura sede e dati fiscali", description: "P.IVA, PEC, indirizzo.", is_required: true, auto_check_key: null },
      { title: "Aggiungi primo dipendente", description: "Staff con accesso al gestionale.", is_required: false, auto_check_key: "has_staff" },
      { title: "Configura il metodo di pagamento", description: "Per ricevere incassi.", is_required: true, auto_check_key: "has_payment_method" },
      { title: "Importa il listino prodotti/servizi", description: "Da usare nei preventivi.", is_required: true, auto_check_key: null },
      { title: "Aggiungi primo fornitore", description: "Per tracciare acquisti.", is_required: false, auto_check_key: "has_supplier" },
      { title: "Aggiungi i primi 10 clienti", description: "Import Excel o manuale.", is_required: true, auto_check_key: "has_customers" },
      { title: "Crea il primo preventivo", description: "Con listino e cliente.", is_required: true, auto_check_key: "has_quote" },
      { title: "Pianifica il primo appuntamento", description: "Sopralluogo o consegna.", is_required: false, auto_check_key: "has_appointment" },
      { title: "Emetti la prima fattura", description: "A fine cliclo.", is_required: false, auto_check_key: "has_invoice" },
    ],
  },
];

function NewTemplateDialog({
  open, onOpenChange, onCreate, creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (p: {
    name: string;
    description: string | null;
    seedSteps?: Array<Omit<Step, "id" | "template_id">>;
  }) => void;
  creating: boolean;
}) {
  const [tab, setTab] = useState<"library" | "custom">("library");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedLib, setSelectedLib] = useState<LibraryTemplate | null>(null);

  useEffect(() => {
    if (open) {
      setTab("library");
      setName("");
      setDesc("");
      setSelectedLib(null);
    }
  }, [open]);

  const handleCreateCustom = () => {
    onCreate({ name: name.trim(), description: desc.trim() || null });
  };

  const handleCreateFromLibrary = () => {
    if (!selectedLib) return;
    onCreate({
      name: selectedLib.name,
      description: selectedLib.description,
      seedSteps: selectedLib.steps.map((s) => ({
        ...s,
        sort_order: 0,  // Il parent ignora e usa l'index della map
      })) as Array<Omit<Step, "id" | "template_id">>,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Nuovo Template Onboarding
          </DialogTitle>
          <DialogDescription>
            Scegli un template pre-configurato dalla libreria, o crea da zero.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Dalla libreria ({TEMPLATE_LIBRARY.length})
            </TabsTrigger>
            <TabsTrigger value="custom">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Parti da zero
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Template già configurati per settore. Clicca per selezionare, poi crea.
              Potrai editare ogni step dopo la creazione.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {TEMPLATE_LIBRARY.map((lib) => {
                const isSelected = selectedLib?.id === lib.id;
                return (
                  <button
                    key={lib.id}
                    type="button"
                    onClick={() => setSelectedLib(lib)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-all",
                      isSelected
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{lib.name}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 shrink-0">{lib.sector}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lib.description}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3 w-3" />
                        {lib.steps.length} step
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {lib.steps.filter(s => s.is_required).length} obbligatori
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        {lib.steps.filter(s => s.auto_check_key).length} auto
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Preview step selezionati */}
            {selectedLib && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold">Anteprima step:</p>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {selectedLib.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-mono text-[10px] w-4 shrink-0 mt-0.5">{i + 1}.</span>
                      <div className="flex-1">
                        <span className="font-medium text-foreground">{s.title}</span>
                        {s.is_required && (
                          <Badge variant="outline" className="ml-2 text-[9px] h-3 border-amber-400 text-amber-700">
                            obbligatorio
                          </Badge>
                        )}
                        {s.auto_check_key && (
                          <Badge variant="outline" className="ml-2 text-[9px] h-3 border-blue-300 text-blue-700">
                            auto
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </TabsContent>

          <TabsContent value="custom" className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Crea un template vuoto e aggiungi gli step uno per uno dopo la creazione.
            </p>
            <div>
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Onboarding serramenti" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="A chi è rivolto, quanto dura, cosa include…"
                rows={3}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          {tab === "library" ? (
            <Button onClick={handleCreateFromLibrary} disabled={!selectedLib || creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Sparkles className="h-4 w-4 mr-2" />
              {selectedLib ? `Usa "${selectedLib.name}"` : "Seleziona un template"}
            </Button>
          ) : (
            <Button onClick={handleCreateCustom} disabled={!name.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Plus className="h-4 w-4 mr-2" />
              Crea Template
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateTemplateDialog({
  source, open, onOpenChange, onDuplicate, creating,
}: {
  source: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicate: (name: string) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(`${source.name} (copia)`);
  }, [open, source.name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplica "{source.name}"</DialogTitle>
          <DialogDescription>
            Verrà creato un nuovo template con tutti gli step dell'originale.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Nome del nuovo template *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={() => onDuplicate(name.trim())}
            disabled={!name.trim() || creating}
          >
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Copy className="h-4 w-4 mr-2" />
            Duplica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({
  template, open, onOpenChange, onSave, saving,
}: {
  template: Template;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (p: { id: string; name: string; description: string | null }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(template.name);
  const [desc, setDesc] = useState(template.description ?? "");
  useEffect(() => {
    if (open) {
      setName(template.name);
      setDesc(template.description ?? "");
    }
  }, [open, template]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={() => onSave({ id: template.id, name: name.trim(), description: desc.trim() || null })}
            disabled={!name.trim() || saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStepDialog({
  step, open, onOpenChange, onSave, saving,
}: {
  step: Step;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (p: { id: string; title: string; description: string | null; is_required: boolean; auto_check_key: string | null }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(step.title);
  const [desc, setDesc] = useState(step.description ?? "");
  const [required, setRequired] = useState(step.is_required);
  const [autoKey, setAutoKey] = useState<string>(step.auto_check_key ?? "__none__");

  useEffect(() => {
    if (open) {
      setTitle(step.title);
      setDesc(step.description ?? "");
      setRequired(step.is_required);
      setAutoKey(step.auto_check_key ?? "__none__");
    }
  }, [open, step]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica step</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Titolo *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Verifica automatica</Label>
            <Select value={autoKey} onValueChange={setAutoKey}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Manuale (checkbox utente)</SelectItem>
                {AUTO_CHECK_KEYS.map(k => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="edit-step-required" checked={required} onCheckedChange={setRequired} />
            <Label htmlFor="edit-step-required" className="text-sm cursor-pointer">Step obbligatorio</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={() => onSave({
              id: step.id,
              title: title.trim(),
              description: desc.trim() || null,
              is_required: required,
              auto_check_key: autoKey && autoKey !== "__none__" ? autoKey : null,
            })}
            disabled={!title.trim() || saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Preview — mostra come vedrà il template l'utente finale (checklist)
function PreviewDialog({
  template, templateId, open, onOpenChange,
}: {
  template: Template;
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: steps = [], isLoading } = useQuery({
    queryKey: ["admin-onboarding-preview-steps", templateId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps" as never)
        .select("id, title, description, is_required, auto_check_key, sort_order")
        .eq("template_id", templateId as never)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as Step[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Anteprima — {template.name}
          </DialogTitle>
          <DialogDescription>
            Come appare il percorso all'azienda cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading && <Skeleton className="h-32 rounded-md" />}

          {!isLoading && steps.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Questo template non ha ancora step configurati.
            </div>
          )}

          {!isLoading && steps.length > 0 && (
            <div className="rounded-lg border divide-y">
              {steps.map((s, i) => (
                <div key={s.id} className="p-3 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full border-2 border-primary/30 flex items-center justify-center shrink-0 mt-0.5 text-sm font-semibold text-primary">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.title}</span>
                      {s.is_required && <Badge variant="outline" className="text-[10px] h-4 border-amber-400 text-amber-700">obbligatorio</Badge>}
                    </div>
                    {s.description && (
                      <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                    )}
                    {s.auto_check_key && (
                      <p className="text-[10px] text-blue-700 dark:text-blue-300 mt-1 flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Si completa automaticamente: {AUTO_CHECK_KEYS.find(k => k.value === s.auto_check_key)?.label ?? s.auto_check_key}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && steps.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {steps.filter(s => s.is_required).length} step obbligatori · {steps.filter(s => s.auto_check_key).length} verifiche automatiche · {steps.length} totali
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
