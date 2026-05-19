/**
 * SettingsSopralluoghi — Impostazioni template sopralluoghi
 *
 * Funzionalità:
 *  - Lista di tutti i template disponibili (4 system + custom company)
 *  - Switch per attivare/disattivare per la company (default: tutti ON)
 *  - Visualizzazione schema (sezioni, campi, foto richieste) per ogni template
 *  - "Clona e personalizza" → crea copia editabile della company
 *  - Editor JSON schema (avanzato) per template della company
 *  - Elimina template della company (system protetti)
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTemplatesWithSettings, toggleTemplateEnabled, cloneTemplate,
  updateTemplate, deleteTemplate, createBlankTemplate, type TemplateWithSettings,
} from "@/lib/api/surveys";
import { SurveyTemplateEditor } from "./SurveyTemplateEditor";
import { SurveyTemplatePreview } from "./SurveyTemplatePreview";
import type { SurveyCategory } from "@/types/surveys";
import type { TemplateSchema } from "@/types/surveys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList, Sparkles, Copy, Trash2, Save, Loader2, ChevronDown, ChevronUp,
  Lock, Camera, FormInput, FileEdit, Plus, AlertCircle, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<string, string> = {
  infissi: "🪟",
  bagno: "🛁",
  fotovoltaico: "☀️",
  ristrutturazione: "🏗️",
  cucina: "🍳",
  cappotto: "🏠",
  tetto: "🏘️",
  impianti: "⚡",
  pavimentazioni: "🪜",
  porte_interne: "🚪",
  climatizzazione: "❄️",
  custom: "📋",
};

export default function SettingsSopralluoghi() {
  const qc = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const enabled = isFeatureEnabled("surveys_module");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["survey-templates-with-settings"],
    queryFn: listTemplatesWithSettings,
    enabled,
  });

  const [selected, setSelected] = useState<TemplateWithSettings | null>(null);
  const [editing, setEditing] = useState<TemplateWithSettings | null>(null);
  const [previewing, setPreviewing] = useState<TemplateWithSettings | null>(null);
  const [cloneDialog, setCloneDialog] = useState<TemplateWithSettings | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<TemplateWithSettings | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      toggleTemplateEnabled(id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  if (!enabled) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-3xl">
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Modulo Sopralluoghi non attivo</p>
              <p className="text-sm text-muted-foreground mt-1">
                Le impostazioni dei sopralluoghi sono disponibili solo per le
                aziende con il modulo Sopralluoghi abilitato (Beta).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const list = templates ?? [];
  const activeCount = list.filter((t) => t.enabled_for_company).length;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">Impostazioni Sopralluoghi</h1>
              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                <Sparkles className="h-3 w-3 mr-1" />
                Beta
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configura i template di rilievo: campi, foto richieste, sezioni.
              Attiva solo quelli che ti servono.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setNewDialogOpen(true)}
          className="gap-2 bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" />
          Nuovo template
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Attivi</p>
              <p className="text-xl font-bold">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Disponibili</p>
              <p className="text-xl font-bold">{list.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
              <Lock className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sistema</p>
              <p className="text-xl font-bold">{list.filter((t) => t.is_system).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center">
              <FileEdit className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Personalizzati</p>
              <p className="text-xl font-bold">{list.filter((t) => !t.is_system).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {!isLoading && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="font-semibold">Nessun template disponibile</p>
            <p className="text-sm text-muted-foreground mt-1">
              I template di sistema (Infissi, Bagno, Fotovoltaico, Ristrutturazione)
              dovrebbero essere visibili. Verifica che il modulo sia attivo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Templates list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              isToggling={toggleMut.isPending && toggleMut.variables?.id === t.id}
              onToggle={(en) => toggleMut.mutate({ id: t.id, enabled: en })}
              onView={() => setSelected(t)}
              onEdit={t.is_system ? undefined : () => setEditing(t)}
              onPreview={() => setPreviewing(t)}
              onClone={() => setCloneDialog(t)}
              onDelete={() => setDeleteDialog(t)}
            />
          ))}
        </div>
      )}

      {/* Detail dialog */}
      {selected && (
        <TemplateDetailDialog
          template={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Clone dialog */}
      {cloneDialog && (
        <CloneDialog
          source={cloneDialog}
          onClose={() => setCloneDialog(null)}
          onCloned={() => {
            setCloneDialog(null);
            qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
          }}
        />
      )}

      {/* Preview interattiva */}
      {previewing && (
        <SurveyTemplatePreview
          template={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}

      {/* Visual editor (solo template company) */}
      {editing && (
        <SurveyTemplateEditor
          templateId={editing.id}
          initialName={editing.name}
          initialDescription={editing.description}
          initialCategory={editing.category as SurveyCategory}
          initialAreaLabel={editing.area_label}
          initialAreaLabelPlural={editing.area_label_plural}
          initialElementLabel={editing.element_label}
          initialSchema={editing.schema}
          onClose={() => setEditing(null)}
        />
      )}

      {/* New template dialog */}
      {newDialogOpen && (
        <NewTemplateDialog
          systemTemplates={list.filter((t) => t.is_system)}
          onClose={() => setNewDialogOpen(false)}
          onCreated={async (newId) => {
            setNewDialogOpen(false);
            // Attendi il refetch effettivo prima di cercare in cache
            await qc.refetchQueries({ queryKey: ["survey-templates-with-settings"] });
            const fresh = (qc.getQueryData<TemplateWithSettings[]>(["survey-templates-with-settings"]) ?? [])
              .find((t) => t.id === newId);
            if (fresh) setEditing(fresh);
            else toast.success("Template creato. Modificalo dalla lista.");
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteDialog && (
        <AlertDialog open onOpenChange={() => setDeleteDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare "{deleteDialog.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Il template verrà rimosso definitivamente. I sopralluoghi già creati con questo template restano intatti ma non sarà più possibile crearne di nuovi.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700"
                onClick={async () => {
                  try {
                    await deleteTemplate(deleteDialog.id);
                    toast.success("Template eliminato");
                    qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
                    setDeleteDialog(null);
                  } catch (e) {
                    toast.error(String(e));
                  }
                }}
              >
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function TemplateRow({
  template, isToggling, onToggle, onView, onEdit, onPreview, onClone, onDelete,
}: {
  template: TemplateWithSettings;
  isToggling: boolean;
  onToggle: (enabled: boolean) => void;
  onView: () => void;
  onEdit?: () => void;
  onPreview: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const stats = useMemo(() => {
    const schema = template.schema as TemplateSchema;
    const headerFields = (schema?.header_schema ?? []).reduce(
      (sum, s) => sum + (s.fields?.length ?? 0), 0,
    );
    const elementTypes = schema?.element_types?.length ?? 0;
    const totalElementFields = (schema?.element_types ?? []).reduce(
      (sum, et) => sum + (et.sections ?? []).reduce(
        (s, sec) => s + (sec.fields?.length ?? 0), 0,
      ), 0,
    );
    const requiredPhotos =
      (schema?.general_required_photos?.length ?? 0) +
      (schema?.area_definition?.required_photos?.length ?? 0) +
      (schema?.element_types ?? []).reduce(
        (sum, et) => sum + (et.required_photos?.length ?? 0), 0,
      );
    return { headerFields, elementTypes, totalElementFields, requiredPhotos };
  }, [template.schema]);

  return (
    <Card className={cn(
      "transition-all",
      !template.enabled_for_company && "opacity-60 grayscale",
    )}>
      <CardContent className="p-4 flex items-start gap-3 flex-wrap">
        <div className="text-3xl shrink-0">{CATEGORY_ICON[template.category] ?? "📋"}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold">{template.name}</p>
            {template.is_system ? (
              <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Sistema
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-700">
                <FileEdit className="h-2.5 w-2.5 mr-0.5" />
                Personalizzato
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <FormInput className="h-3 w-3" /> {stats.headerFields + stats.totalElementFields} campi
            </span>
            <span>· {stats.elementTypes} tipologie elementi</span>
            <span className="flex items-center gap-1">
              <Camera className="h-3 w-3" /> {stats.requiredPhotos} foto richieste
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isToggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <div className="flex items-center gap-1.5">
              <Switch
                checked={template.enabled_for_company}
                onCheckedChange={onToggle}
              />
              <span className="text-[11px] text-muted-foreground">
                {template.enabled_for_company ? "Attivo" : "Disattivo"}
              </span>
            </div>
          )}
        </div>
        {/* v8.6.72 — Mobile-friendly: testo nascosto su xs (icon-only),
            full label da sm. Prima 3-4 bottoni in 2 righe su 375px. */}
        <div className="flex items-center gap-1.5 ml-auto w-full sm:w-auto sm:ml-0 flex-wrap">
          <Button
            variant="outline" size="sm"
            className="gap-1 border-violet-300 text-violet-700 hover:bg-violet-50"
            onClick={onPreview}
            title="Anteprima interattiva del template"
            aria-label="Anteprima"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anteprima</span>
          </Button>
          {onEdit ? (
            <Button variant="default" size="sm" className="gap-1 bg-orange-600 hover:bg-orange-700" onClick={onEdit} aria-label="Modifica">
              <FileEdit className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Modifica</span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" onClick={onView} aria-label="Vedi schema">
              <Eye className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Vedi schema</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={onClone} title="Crea copia modificabile" aria-label="Clona">
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clona</span>
          </Button>
          {!template.is_system && (
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-rose-600" aria-label="Elimina">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function TemplateDetailDialog({
  template, onClose,
}: { template: TemplateWithSettings; onClose: () => void }) {
  const schema = template.schema as TemplateSchema;
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const qc = useQueryClient();
  const isEditable = !template.is_system;

  // Editor avanzato JSON
  const [jsonText, setJsonText] = useState(() => JSON.stringify(template.schema, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const saveSchemaMut = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        throw new Error("JSON non valido: " + (e instanceof Error ? e.message : String(e)));
      }
      await updateTemplate(template.id, { schema: parsed });
    },
    onSuccess: () => {
      toast.success("Schema salvato");
      qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
      setJsonError(null);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setJsonError(msg);
      toast.error("Salvataggio fallito", { description: msg });
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="text-2xl">{CATEGORY_ICON[template.category] ?? "📋"}</span>
            {template.name}
            {template.is_system && (
              <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Sistema (read-only)
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {template.description ?? "Schema completo del template"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5 py-3">
          <div className="space-y-4 pb-3">
            {/* Header sections */}
            {(schema?.header_schema?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-1.5">
                  <FormInput className="h-3.5 w-3.5" />
                  Sezioni Header ({schema.header_schema.length})
                </h3>
                <div className="space-y-1.5">
                  {schema.header_schema.map((sec) => {
                    const k = `h-${sec.key}`;
                    const open = expandedSection === k;
                    return (
                      <div key={k} className="border rounded-md overflow-hidden">
                        <button
                          type="button"
                          className="w-full p-2.5 bg-muted/30 flex items-center justify-between text-left"
                          onClick={() => setExpandedSection(open ? null : k)}
                        >
                          <div>
                            <p className="text-sm font-semibold">{sec.label}</p>
                            <p className="text-[11px] text-muted-foreground">{sec.fields?.length ?? 0} campi</p>
                          </div>
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {open && (
                          <div className="p-3 space-y-1 text-xs">
                            {(sec.fields ?? []).map((f) => (
                              <div key={f.key} className="flex items-center gap-2 flex-wrap py-1 border-b last:border-b-0">
                                <Badge variant="outline" className="text-[10px] font-mono">{f.type}</Badge>
                                <span className="font-medium">{f.label}</span>
                                {f.required && <span className="text-rose-500">*</span>}
                                <code className="text-[10px] text-muted-foreground ml-auto">{f.key}</code>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Area */}
            {schema?.area_definition && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2">
                  Definizione {template.area_label_plural}
                </h3>
                <div className="border rounded-md p-3 text-xs space-y-2">
                  <p><span className="font-semibold">Etichetta singolare:</span> {schema.area_definition.label}</p>
                  <p><span className="font-semibold">Etichetta plurale:</span> {schema.area_definition.label_plural}</p>
                  {schema.area_definition.name_suggestions && (
                    <div>
                      <p className="font-semibold">Suggerimenti nomi:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {schema.area_definition.name_suggestions.map((n) => (
                          <Badge key={n} variant="outline" className="text-[10px]">{n}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <p><span className="font-semibold">{schema.area_definition.fields?.length ?? 0} campi</span> per area</p>
                  {(schema.area_definition.required_photos?.length ?? 0) > 0 && (
                    <p className="flex items-center gap-1">
                      <Camera className="h-3 w-3" />
                      <span className="font-semibold">{schema.area_definition.required_photos!.length} foto richieste</span> per area
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* Element types */}
            {(schema?.element_types?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2">
                  Tipologie elementi ({schema.element_types.length})
                </h3>
                <div className="space-y-1.5">
                  {schema.element_types.map((et) => {
                    const k = `e-${et.key}`;
                    const open = expandedSection === k;
                    const totalFields = (et.sections ?? []).reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);
                    return (
                      <div key={k} className="border rounded-md overflow-hidden">
                        <button
                          type="button"
                          className="w-full p-2.5 bg-muted/30 flex items-center justify-between text-left"
                          onClick={() => setExpandedSection(open ? null : k)}
                        >
                          <div>
                            <p className="text-sm font-semibold">{et.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {et.sections?.length ?? 0} sezioni · {totalFields} campi · {et.required_photos?.length ?? 0} foto
                            </p>
                          </div>
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {open && (
                          <div className="p-3 space-y-2 text-xs">
                            {(et.sections ?? []).map((sec) => (
                              <div key={sec.key}>
                                <p className="font-semibold text-orange-700">{sec.label}</p>
                                <div className="ml-2 mt-1 space-y-0.5">
                                  {(sec.fields ?? []).map((f) => (
                                    <div key={f.key} className="flex items-center gap-2 flex-wrap py-0.5">
                                      <Badge variant="outline" className="text-[10px] font-mono">{f.type}</Badge>
                                      <span>{f.label}</span>
                                      {f.required && <span className="text-rose-500 text-xs">*</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {(et.required_photos?.length ?? 0) > 0 && (
                              <div className="pt-2 border-t">
                                <p className="font-semibold text-violet-700 flex items-center gap-1">
                                  <Camera className="h-3 w-3" /> Foto richieste:
                                </p>
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  {et.required_photos.map((p) => (
                                    <div key={p.key} className="flex items-center gap-1.5 text-[11px]">
                                      <Camera className="h-3 w-3 text-muted-foreground" />
                                      {p.label} {p.required && <span className="text-rose-500">*</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Advanced JSON editor — solo per template della company */}
            {isEditable && (
              <section className="pt-4 border-t">
                <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-1.5">
                  <FileEdit className="h-3.5 w-3.5" />
                  Editor avanzato (JSON schema)
                </h3>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Modifica direttamente il JSON del template. Per documentazione struttura, vedi
                  i template di sistema clonabili. Errori di sintassi vengono bloccati.
                </p>
                <Textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={16}
                  className="font-mono text-[11px]"
                />
                {jsonError && (
                  <p className="text-xs text-rose-600 mt-1">{jsonError}</p>
                )}
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={() => saveSchemaMut.mutate()}
                    disabled={saveSchemaMut.isPending}
                    className="gap-1.5 bg-orange-600 hover:bg-orange-700"
                  >
                    {saveSchemaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salva schema
                  </Button>
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function NewTemplateDialog({
  systemTemplates, onClose, onCreated,
}: {
  systemTemplates: TemplateWithSettings[];
  onClose: () => void;
  onCreated: (newId: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"blank" | "clone">("blank");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("custom");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState<string>("");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Inserisci un nome");
      if (mode === "clone") {
        if (!sourceId) throw new Error("Scegli un template da replicare");
        return cloneTemplate(sourceId, name);
      }
      return createBlankTemplate({ name, category, description: description || null });
    },
    onSuccess: (id) => {
      toast.success(mode === "clone" ? "Template replicato" : "Template creato");
      onCreated(id);
    },
    onError: (e) => toast.error("Operazione fallita", { description: String(e) }),
  });

  const canSubmit = name.trim().length >= 3 && (mode === "blank" || sourceId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-orange-600" />
            Nuovo template sopralluogo
          </DialogTitle>
          <DialogDescription>
            Crea un nuovo template da zero o replica uno esistente per personalizzarlo.
          </DialogDescription>
        </DialogHeader>

        {/* Mode picker */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("blank")}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              mode === "blank" ? "border-orange-500 bg-orange-50" : "border-muted hover:border-orange-300",
            )}
          >
            <FileEdit className="h-5 w-5 text-orange-600 mb-1" />
            <p className="font-semibold text-sm">Da zero</p>
            <p className="text-[11px] text-muted-foreground">Template vuoto: aggiungi tu sezioni, campi, foto</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("clone")}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              mode === "clone" ? "border-orange-500 bg-orange-50" : "border-muted hover:border-orange-300",
            )}
          >
            <Copy className="h-5 w-5 text-orange-600 mb-1" />
            <p className="font-semibold text-sm">Replica esistente</p>
            <p className="text-[11px] text-muted-foreground">Parti da un template di sistema (Infissi, Bagno, ...)</p>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome del nuovo template</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Rilievo Infissi Personalizzato"
            />
          </div>

          {mode === "blank" && (
            <>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["custom", "📋 Custom"],
                      ["infissi", "🪟 Infissi"],
                      ["bagno", "🛁 Bagno"],
                      ["fotovoltaico", "☀️ Fotovoltaico"],
                      ["ristrutturazione", "🏗️ Ristrutturazione"],
                      ["cucina", "🍳 Cucina"],
                      ["cappotto", "🏠 Cappotto"],
                      ["tetto", "🏘️ Tetto"],
                      ["impianti", "⚡ Impianti"],
                      ["pavimentazioni", "🪜 Pavimentazioni"],
                      ["porte_interne", "🚪 Porte interne"],
                      ["climatizzazione", "❄️ Climatizzazione"],
                    ].map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Descrizione (opzionale)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Cosa rileva questo template e quando usarlo"
                />
              </div>
            </>
          )}

          {mode === "clone" && (
            <div>
              <Label className="text-xs">Template da replicare</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="Scegli un template…" /></SelectTrigger>
                <SelectContent>
                  {systemTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Verrà creata una copia completa modificabile del template scelto.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit || createMut.isPending}
            className="gap-1.5 bg-orange-600 hover:bg-orange-700"
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {mode === "clone" ? "Replica e modifica" : "Crea e modifica"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloneDialog({
  source, onClose, onCloned,
}: {
  source: TemplateWithSettings;
  onClose: () => void;
  onCloned: (newId: string) => void;
}) {
  const [name, setName] = useState(`Copia di ${source.name}`);
  const cloneMut = useMutation({
    mutationFn: () => cloneTemplate(source.id, name),
    onSuccess: (newId) => {
      toast.success("Template clonato — ora puoi personalizzarlo");
      onCloned(newId);
    },
    onError: (e) => toast.error("Clonazione fallita", { description: String(e) }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-orange-600" />
            Clona "{source.name}"
          </DialogTitle>
          <DialogDescription>
            Crea una copia modificabile di questo template. Potrai personalizzare
            campi, foto richieste, sezioni.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome del nuovo template</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Rilievo Infissi Personalizzato"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => cloneMut.mutate()}
            disabled={!name.trim() || cloneMut.isPending}
            className="gap-1.5 bg-orange-600 hover:bg-orange-700"
          >
            {cloneMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Clona e crea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
