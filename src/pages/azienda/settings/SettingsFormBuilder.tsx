import { useEffect, useMemo, useState } from "react";
import { useFormBuilder, type FormField, type FormFieldType, type LeadForm } from "@/hooks/useFormBuilder";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { TrackingSnippetSettings } from "@/components/settings/TrackingSnippetSettings";
import { FormFieldLibrary } from "@/components/settings/FormFieldLibrary";
import { FormEditorCanvas } from "@/components/settings/FormEditorCanvas";
import { FormFieldProperties } from "@/components/settings/FormFieldProperties";
import { FormSettingsPanel } from "@/components/settings/FormSettingsPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertCircle, Plus, Eye, FileText, Trash2, Pencil, ExternalLink, Copy, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  buildLeadFormPublicUrl,
  getLeadFormBaseUrl,
  buildUniqueFieldName,
  copyTextToClipboard,
  sanitizeLeadFormSlug,
  validateLeadFormDraft,
} from "@/lib/formBuilder";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

type FormSavePayload = Partial<LeadForm> & { id: string };

type FormEditorDraft = {
  baseUpdatedAt: string;
  savedAt: string;
  formName: string;
  formDesc: string;
  fields: FormField[];
  settings: Record<string, unknown>;
  theme: Record<string, unknown>;
};

function getFormEditorDraftKey(form: LeadForm) {
  return `lead-form-editor-draft:${form.company_id}:${form.id}`;
}

function readFormEditorDraft(form: LeadForm): FormEditorDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const rawDraft = window.sessionStorage.getItem(getFormEditorDraftKey(form));
    if (!rawDraft) return null;
    const draft = JSON.parse(rawDraft) as Partial<FormEditorDraft>;
    if (draft.baseUpdatedAt !== form.updated_at) return null;
    if (!draft.formName || !Array.isArray(draft.fields)) return null;

    return {
      baseUpdatedAt: draft.baseUpdatedAt,
      savedAt: draft.savedAt || new Date().toISOString(),
      formName: draft.formName,
      formDesc: draft.formDesc || "",
      fields: draft.fields,
      settings: draft.settings || {},
      theme: draft.theme || {},
    };
  } catch {
    return null;
  }
}

function writeFormEditorDraft(form: LeadForm, draft: Omit<FormEditorDraft, "baseUpdatedAt" | "savedAt">) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      getFormEditorDraftKey(form),
      JSON.stringify({
        ...draft,
        baseUpdatedAt: form.updated_at,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Se lo storage non e' disponibile, il salvataggio remoto resta la fonte di verita.
  }
}

function clearFormEditorDraft(form: LeadForm) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(getFormEditorDraftKey(form));
  } catch {
    // Ignora storage non disponibile.
  }
}

function stableDraftString(value: unknown) {
  return JSON.stringify(value);
}

function FormsList({
  forms,
  isLoading,
  onEdit,
  onCreate,
  onTogglePublish,
  onDelete,
  canEdit,
  isPublishing,
}: {
  forms: LeadForm[];
  isLoading: boolean;
  onEdit: (f: LeadForm) => void;
  onCreate: () => void;
  onTogglePublish: (f: LeadForm) => void;
  onDelete: (id: string) => Promise<void>;
  canEdit: boolean;
  isPublishing: boolean;
}) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const formBaseUrl = getLeadFormBaseUrl();

  const copyPublicUrl = async (url: string) => {
    try {
      await copyTextToClipboard(url);
      toast.success("Link copiato");
    } catch {
      toast.error("Copia non riuscita", { description: "Seleziona il link e copialo manualmente." });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">I tuoi moduli</h2>
          <p className="text-sm text-muted-foreground">Chi compila un modulo diventa un contatto nel CRM.</p>
        </div>
        <Button size="sm" onClick={onCreate} className="gap-1.5 max-md:h-11 max-sm:w-full" disabled={!canEdit}>
          <Plus className="h-3.5 w-3.5" /> Nuovo modulo
        </Button>
      </div>

      {forms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nessun modulo creato. Crea il primo per cominciare a raccogliere contatti dal tuo sito.</p>
            <Button size="sm" className="mt-4 gap-1.5 max-md:h-11" onClick={onCreate} disabled={!canEdit}>
              <Plus className="h-3.5 w-3.5" /> Crea un modulo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {forms.map((f) => {
            const convRate = f.total_views > 0 ? ((f.total_submissions / f.total_views) * 100).toFixed(1) : "0";
            const publicUrl = buildLeadFormPublicUrl(formBaseUrl, f.slug, f.company_id);
            return (
              <Card key={f.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm break-words">{f.name}</h3>
                        <Badge variant={f.is_published ? "default" : "secondary"} className="text-[10px]">
                          {f.is_published ? "Pubblicato" : "Bozza"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">/{f.slug} · {f.fields.length} campi</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {f.total_views} visualizzazioni</span>
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {f.total_submissions} invii</span>
                        <span>{convRate}% conversione</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                      <Switch
                        checked={f.is_published}
                        onCheckedChange={() => onTogglePublish(f)}
                        disabled={!canEdit || isPublishing}
                        aria-label={f.is_published ? `Sospendi la pubblicazione di «${f.name}»` : `Pubblica «${f.name}»`}
                        // L'interruttore è alto 24 px: sul telefono la zona che risponde al dito arriva a 44 px senza spostare niente.
                        className="max-md:relative max-md:before:absolute max-md:before:-inset-x-1 max-md:before:-inset-y-2.5 max-md:before:content-['']"
                      />
                      {f.is_published && publicUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 md:h-8 md:w-8"
                          onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
                          aria-label={`Apri il modulo «${f.name}»`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {f.is_published && publicUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 md:h-8 md:w-8"
                          onClick={() => copyPublicUrl(publicUrl)}
                          aria-label={`Copia il link di «${f.name}»`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8" onClick={() => onEdit(f)} aria-label={canEdit ? `Modifica il modulo «${f.name}»` : `Guarda il modulo «${f.name}»`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8 text-destructive" onClick={() => setDeleteId(f.id)} disabled={!canEdit} aria-label={`Elimina il modulo «${f.name}»`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => {
        if (!open && !deletingId) setDeleteId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il modulo?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const richieste = forms.find((f) => f.id === deleteId)?.total_submissions ?? 0;
                return `Spariscono anche le richieste ricevute con questo modulo (${richieste}). I contatti già creati restano. Per fermarlo senza cancellare, togli la spunta da «Pubblicato».`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId} className="max-md:h-11">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault();
                if (!deleteId) return;
                setDeletingId(deleteId);
                try {
                  await onDelete(deleteId);
                  setDeleteId(null);
                } catch {
                  // La mutation mostra già il toast; lasciamo aperto il dialog.
                } finally {
                  setDeletingId(null);
                }
              }}
              disabled={!!deletingId}
              className="max-md:h-11"
            >
              {deletingId ? "Elimino…" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FormEditor({
  form,
  onBack,
  onSave,
  canEdit,
  isSaving,
}: {
  form: LeadForm;
  onBack: () => void;
  onSave: (updates: FormSavePayload) => Promise<void>;
  canEdit: boolean;
  isSaving: boolean;
}) {
  const [initialDraft] = useState(() => readFormEditorDraft(form));
  const [isDraftRestored, setIsDraftRestored] = useState(() => Boolean(initialDraft));
  const [fields, setFields] = useState<FormField[]>(() => initialDraft?.fields ?? form.fields);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [formName, setFormName] = useState(() => initialDraft?.formName ?? form.name);
  const [formDesc, setFormDesc] = useState(() => initialDraft?.formDesc ?? form.description ?? "");
  const [settings, setSettings] = useState(() => initialDraft?.settings ?? form.settings);
  const [theme, setTheme] = useState(() => initialDraft?.theme ?? form.theme);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;
  const baseSnapshot = useMemo(
    () => stableDraftString({
      formName: form.name,
      formDesc: form.description || "",
      fields: form.fields,
      settings: form.settings,
      theme: form.theme,
    }),
    [form.description, form.fields, form.name, form.settings, form.theme],
  );
  const draftSnapshot = useMemo(
    () => stableDraftString({ formName, formDesc, fields, settings, theme }),
    [fields, formDesc, formName, settings, theme],
  );
  const hasUnsavedChanges = draftSnapshot !== baseSnapshot;
  // La bozza locale protegge da un ricaricamento; qui si chiede conferma anche a chi esce dal menu o chiude la scheda.
  useSettingsDraftGuard(canEdit && (hasUnsavedChanges || isSaving));

  useEffect(() => {
    if (!canEdit) return;
    if (!hasUnsavedChanges) {
      clearFormEditorDraft(form);
      return;
    }

    writeFormEditorDraft(form, { formName, formDesc, fields, settings, theme });
  }, [canEdit, fields, form, formDesc, formName, hasUnsavedChanges, settings, theme]);

  const handleAddField = (type: FormFieldType) => {
    if (!canEdit) return;
    const labelMap: Partial<Record<FormFieldType, string>> = {
      email: "Email", phone: "Telefono", heading: "Titolo sezione",
      paragraph: "Testo descrittivo", divider: "Separatore", hidden: "Campo nascosto",
      date: "Data", radio: "Scelta", select: "Selezione", checkbox: "Accetto",
      consent: "Ho letto e accetto l'informativa privacy",
    };
    const newField: FormField = {
      id: crypto.randomUUID(),
      name: type === "divider" ? `divider_${fields.length + 1}` : buildUniqueFieldName(labelMap[type] || type, fields.map((field) => field.name)),
      label: labelMap[type] || `Campo ${fields.length + 1}`,
      type,
      // Il consenso privacy nasce obbligatorio (deve essere spuntato per inviare).
      required: type === "email" || type === "consent",
      placeholder: "",
      options: (type === "select" || type === "radio") ? ["Opzione 1", "Opzione 2"] : undefined,
      linkText: type === "consent" ? "Informativa privacy" : undefined,
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleUpdateField = (updates: Partial<FormField>) => {
    if (!selectedFieldId || !canEdit) return;
    setFields(fields.map((f) => (f.id === selectedFieldId ? { ...f, ...updates } : f)));
  };

  const handleDeleteField = () => {
    if (!selectedFieldId || !canEdit) return;
    setFields(fields.filter((f) => f.id !== selectedFieldId));
    setSelectedFieldId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = fields.findIndex((f) => f.id === active.id);
    const newIdx = fields.findIndex((f) => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setFields(arrayMove(fields, oldIdx, newIdx));
  };

  const handleDiscardDraft = () => {
    clearFormEditorDraft(form);
    setFormName(form.name);
    setFormDesc(form.description || "");
    setFields(form.fields);
    setSettings(form.settings);
    setTheme(form.theme);
    setSelectedFieldId(null);
    setIsDraftRestored(false);
    toast.info("Bozza locale scartata");
  };

  const handleSave = async () => {
    const payload: FormSavePayload = {
      id: form.id,
      name: formName.trim(),
      description: formDesc || null,
      fields,
      settings,
      theme,
    };
    const validation = validateLeadFormDraft({ ...form, ...payload, fields });
    if (!validation.ok) {
      toast.error("Controlla il modulo", { description: validation.errors[0] });
      return;
    }
    try {
      await onSave(payload);
      clearFormEditorDraft(form);
      setIsDraftRestored(false);
    } catch {
      // La mutation mostra già il toast; evitiamo una promise rejection nell'handler UI.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 max-md:h-11">
          <ArrowLeft className="h-3.5 w-3.5" /> Indietro
        </Button>
        {!canEdit && <Badge variant="secondary">Solo lettura</Badge>}
      </div>

      {isDraftRestored && canEdit && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Bozza recuperata</AlertTitle>
          <AlertDescription>Ho ripristinato le modifiche non ancora salvate di questo computer, così non perdi il lavoro dopo un ricaricamento.</AlertDescription>
        </Alert>
      )}

      {!canEdit && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Solo lettura</AlertTitle>
          <AlertDescription>Puoi guardare campi, impostazioni e link, ma per modificarli serve il permesso «Modifica» su Personalizzazione.</AlertDescription>
        </Alert>
      )}

      {/* Form meta */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="modulo-nome" className="text-xs">Nome del modulo</Label>
          <Input id="modulo-nome" value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm max-md:h-11" disabled={!canEdit || isSaving} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="modulo-descrizione" className="text-xs">Descrizione</Label>
          <Input id="modulo-descrizione" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="h-8 text-sm max-md:h-11" disabled={!canEdit || isSaving} />
        </div>
      </div>

      {/* 3-column editor */}
      <div className="grid gap-4 min-h-[400px] xl:grid-cols-[180px_minmax(0,1fr)_260px]">
        {/* Left: field library */}
        <div className="border rounded-lg p-3">
          <FormFieldLibrary onAddField={handleAddField} disabled={!canEdit || isSaving} />
        </div>

        {/* Center: canvas */}
        <div className="border rounded-lg p-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <FormEditorCanvas
                fields={fields}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
                disabled={!canEdit || isSaving}
              />
            </SortableContext>
          </DndContext>
        </div>

        {/* Right: properties or settings panel */}
        <div className="border rounded-lg p-3">
          {selectedField ? (
            <FormFieldProperties
              field={selectedField}
              onUpdate={handleUpdateField}
              onDelete={handleDeleteField}
              disabled={!canEdit || isSaving}
            />
          ) : (
            <FormSettingsPanel
              form={form}
              theme={theme}
              settings={settings}
              onThemeChange={setTheme}
              onSettingsChange={setSettings}
              disabled={!canEdit || isSaving}
            />
          )}
        </div>
      </div>

      {/* «Salva» sta in una barra che resta in vista: nell'editor lungo il pulsante in cima usciva dallo schermo. */}
      {canEdit && (hasUnsavedChanges || isSaving) && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <span role="status" className="text-sm font-medium">Modifiche non salvate</span>
            <p className="text-xs text-muted-foreground">Restano su questo computer finché non salvi o le scarti.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleDiscardDraft} disabled={isSaving} className="max-md:h-11">
              Scarta
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving || !hasUnsavedChanges} className="max-md:h-11">
              {isSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Salva modifiche
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsFormBuilder() {
  // Riuso lato super-admin: la pagina è avvolta in PlatformCompanyProvider, che
  // sovrascrive effectiveCompany sulla Platform Admin CRM. useFormBuilder e
  // usePermissions leggono quel contesto (super_admin → ALL_PERMISSIONS), quindi
  // qui non serve nessuna prop dedicata.
  const { forms, isLoading, isError, error, refetch, editingForm, setEditingForm, createForm, updateForm, deleteForm, togglePublish } = useFormBuilder();
  const permissions = usePermissions();
  const canEdit = permissions.isAdmin || permissions.canEditSettingsCustomization;
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const slug = sanitizeLeadFormSlug(newSlug || newName);
    const validation = validateLeadFormDraft({ name: newName, slug });
    if (!validation.ok) {
      toast.error("Controlla il nuovo modulo", { description: validation.errors[0] });
      return;
    }

    try {
      await createForm.mutateAsync({ name: newName.trim(), slug });
      setCreateOpen(false);
      setNewName("");
      setNewSlug("");
    } catch {
      // La mutation mostra già il toast e il dialog resta aperto per correggere.
    }
  };

  if (editingForm) {
    return (
      <FormEditor
        form={editingForm}
        onBack={() => setEditingForm(null)}
        canEdit={canEdit}
        isSaving={updateForm.isPending}
        onSave={async (updates) => {
          await updateForm.mutateAsync(updates);
          setEditingForm(null);
        }}
      />
    );
  }

  return (
    <Tabs defaultValue="forms" className="space-y-4">
      <TabsList>
        <TabsTrigger value="forms" className="max-md:min-h-11">Moduli</TabsTrigger>
        <TabsTrigger value="tracking" className="max-md:min-h-11">Da dove arrivano i contatti</TabsTrigger>
      </TabsList>

      <TabsContent value="forms">
        {isError ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Moduli non disponibili</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{userErrorMessage(error, "Non è stato possibile caricare i moduli.")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()} className="max-md:h-11">
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <FormsList
              forms={forms}
              isLoading={isLoading}
              onEdit={setEditingForm}
              onCreate={() => setCreateOpen(true)}
              onTogglePublish={togglePublish}
              onDelete={(id) => deleteForm.mutateAsync(id)}
              canEdit={canEdit}
              isPublishing={updateForm.isPending}
            />

            <Dialog open={createOpen} onOpenChange={(open) => {
              if (!createForm.isPending) setCreateOpen(open);
            }}>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nuovo modulo</DialogTitle>
                  <DialogDescription>Dai un nome al modulo: poi aggiungi i campi e scegli cosa succede quando qualcuno lo compila.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="nuovo-modulo-nome">Nome</Label>
                    <Input
                      id="nuovo-modulo-nome"
                      className="max-md:h-11"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        setNewSlug(sanitizeLeadFormSlug(e.target.value));
                      }}
                      placeholder="Es: Richiesta preventivo"
                      disabled={createForm.isPending}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nuovo-modulo-indirizzo">Indirizzo del modulo</Label>
                    <Input
                      id="nuovo-modulo-indirizzo"
                      className="max-md:h-11"
                      value={newSlug}
                      onChange={(e) => setNewSlug(sanitizeLeadFormSlug(e.target.value))}
                      placeholder="richiesta-preventivo"
                      disabled={createForm.isPending}
                    />
                    <p className="text-xs text-muted-foreground">Compare nel link, per esempio …/richiesta-preventivo. Solo lettere, numeri e trattini.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createForm.isPending} className="max-md:h-11">Annulla</Button>
                  <Button onClick={handleCreate} disabled={!newName.trim() || !newSlug || createForm.isPending} className="max-md:h-11">
                    {createForm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Crea
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </TabsContent>

      <TabsContent value="tracking">
        <TrackingSnippetSettings />
      </TabsContent>
    </Tabs>
  );
}
