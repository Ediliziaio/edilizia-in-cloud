import { useState } from "react";
import { useFormBuilder, type FormField, type FormFieldType, type LeadForm } from "@/hooks/useFormBuilder";
import { TrackingSnippetSettings } from "@/components/settings/TrackingSnippetSettings";
import { FormFieldLibrary } from "@/components/settings/FormFieldLibrary";
import { FormEditorCanvas } from "@/components/settings/FormEditorCanvas";
import { FormFieldProperties } from "@/components/settings/FormFieldProperties";
import { FormSettingsPanel } from "@/components/settings/FormSettingsPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Eye, FileText, Trash2, Pencil, ExternalLink, Copy, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

function FormsList({
  forms,
  isLoading,
  onEdit,
  onCreate,
  onTogglePublish,
  onDelete,
}: {
  forms: LeadForm[];
  isLoading: boolean;
  onEdit: (f: LeadForm) => void;
  onCreate: () => void;
  onTogglePublish: (f: LeadForm) => void;
  onDelete: (id: string) => void;
}) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Form di acquisizione lead</h2>
          <p className="text-sm text-muted-foreground">Crea e gestisci i form per catturare contatti</p>
        </div>
        <Button size="sm" onClick={onCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nuovo form
        </Button>
      </div>

      {forms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nessun form creato. Crea il tuo primo form per iniziare a catturare lead.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" /> Crea form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {forms.map((f) => {
            const convRate = f.total_views > 0 ? ((f.total_submissions / f.total_views) * 100).toFixed(1) : "0";
            return (
              <Card key={f.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-sm truncate">{f.name}</h3>
                        <Badge variant={f.is_published ? "default" : "secondary"} className="text-[10px]">
                          {f.is_published ? "Pubblicato" : "Bozza"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">/{f.slug} · {f.fields.length} campi</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {f.total_views} visualizzazioni</span>
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {f.total_submissions} invii</span>
                        <span>{convRate}% conversione</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={f.is_published}
                        onCheckedChange={() => onTogglePublish(f)}
                      />
                      {f.is_published && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const url = `${supabaseUrl}/functions/v1/form-render?slug=${f.slug}&company_id=${f.company_id}`;
                            window.open(url, "_blank");
                          }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {f.is_published && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const url = `${supabaseUrl}/functions/v1/form-render?slug=${f.slug}&company_id=${f.company_id}`;
                            navigator.clipboard.writeText(url);
                            toast.success("Link copiato!");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(f)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(f.id)}>
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina form</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Tutti i dati e le submission saranno eliminati.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) { onDelete(deleteId); setDeleteId(null); } }}>
              Elimina
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
}: {
  form: LeadForm;
  onBack: () => void;
  onSave: (updates: Partial<LeadForm>) => void;
}) {
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [formName, setFormName] = useState(form.name);
  const [formDesc, setFormDesc] = useState(form.description || "");
  const [settings, setSettings] = useState(form.settings);
  const [theme, setTheme] = useState(form.theme);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const selectedField = fields.find((f) => f.id === selectedFieldId) || null;

  const handleAddField = (type: FormFieldType) => {
    const labelMap: Partial<Record<FormFieldType, string>> = {
      email: "Email", phone: "Telefono", heading: "Titolo sezione",
      paragraph: "Testo descrittivo", divider: "Separatore", hidden: "Campo nascosto",
      date: "Data", radio: "Scelta", select: "Selezione", checkbox: "Accetto",
    };
    const newField: FormField = {
      id: crypto.randomUUID(),
      name: type === "divider" ? `divider_${fields.length + 1}` : `field_${fields.length + 1}`,
      label: labelMap[type] || `Campo ${fields.length + 1}`,
      type,
      required: type === "email",
      placeholder: "",
      options: (type === "select" || type === "radio") ? ["Opzione 1", "Opzione 2"] : undefined,
    };
    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  const handleUpdateField = (updates: Partial<FormField>) => {
    if (!selectedFieldId) return;
    setFields(fields.map((f) => (f.id === selectedFieldId ? { ...f, ...updates } : f)));
  };

  const handleDeleteField = () => {
    if (!selectedFieldId) return;
    setFields(fields.filter((f) => f.id !== selectedFieldId));
    setSelectedFieldId(null);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = fields.findIndex((f) => f.id === active.id);
    const newIdx = fields.findIndex((f) => f.id === over.id);
    setFields(arrayMove(fields, oldIdx, newIdx));
  };

  const handleSave = () => {
    onSave({
      id: form.id,
      name: formName,
      description: formDesc || null,
      fields,
      settings,
      theme,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Indietro
        </Button>
        <Button size="sm" onClick={handleSave}>Salva modifiche</Button>
      </div>

      {/* Form meta */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Nome form</Label>
          <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Descrizione</Label>
          <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {/* Theme settings */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Colore accento</Label>
          <Input
            type="color"
            value={theme.accent_color || "#2563eb"}
            onChange={(e) => setTheme({ ...theme, accent_color: e.target.value })}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Testo bottone</Label>
          <Input
            value={settings.submit_label || "Invia"}
            onChange={(e) => setSettings({ ...settings, submit_label: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Messaggio successo</Label>
          <Input
            value={settings.success_message || ""}
            onChange={(e) => setSettings({ ...settings, success_message: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* 3-column editor */}
      <div className="grid grid-cols-[180px_1fr_220px] gap-4 min-h-[400px]">
        {/* Left: field library */}
        <div className="border rounded-lg p-3">
          <FormFieldLibrary onAddField={handleAddField} />
        </div>

        {/* Center: canvas */}
        <div className="border rounded-lg p-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <FormEditorCanvas
                fields={fields}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
              />
            </SortableContext>
          </DndContext>
        </div>

        {/* Right: properties */}
        <div className="border rounded-lg p-3">
          <FormFieldProperties
            field={selectedField}
            onUpdate={handleUpdateField}
            onDelete={handleDeleteField}
          />
        </div>
      </div>
    </div>
  );
}

export default function SettingsFormBuilder() {
  const { forms, isLoading, editingForm, setEditingForm, createForm, updateForm, deleteForm, togglePublish } = useFormBuilder();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    const slug = newSlug.trim() || newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    createForm.mutate({ name: newName.trim(), slug });
    setCreateOpen(false);
    setNewName("");
    setNewSlug("");
  };

  if (editingForm) {
    return (
      <FormEditor
        form={editingForm}
        onBack={() => setEditingForm(null)}
        onSave={(updates) => {
          updateForm.mutate(updates as any);
          setEditingForm(null);
        }}
      />
    );
  }

  return (
    <Tabs defaultValue="forms" className="space-y-4">
      <TabsList>
        <TabsTrigger value="forms">Form Builder</TabsTrigger>
        <TabsTrigger value="tracking">Tracking UTM</TabsTrigger>
      </TabsList>

      <TabsContent value="forms">
        <FormsList
          forms={forms}
          isLoading={isLoading}
          onEdit={setEditingForm}
          onCreate={() => setCreateOpen(true)}
          onTogglePublish={togglePublish}
          onDelete={(id) => deleteForm.mutate(id)}
        />

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo form</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                  }}
                  placeholder="Es: Richiesta preventivo"
                />
              </div>
              <div className="space-y-1">
                <Label>Slug (URL)</Label>
                <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="richiesta-preventivo" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>Crea</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="tracking">
        <TrackingSnippetSettings />
      </TabsContent>
    </Tabs>
  );
}
