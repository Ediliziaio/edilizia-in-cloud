/**
 * SettingsSopralluoghi — i modelli con cui si fa un sopralluogo
 *
 * Funzionalità:
 *  - Elenco di tutti i modelli (quelli di serie e quelli dell'azienda)
 *  - Interruttore per usare o no un modello nell'azienda (di base: tutti attivi)
 *  - «Vedi i campi»: sezioni, campi e foto richieste di ogni modello
 *  - «Copia» → una copia modificabile, dell'azienda
 *  - Modifica avanzata (schema JSON) per i modelli dell'azienda
 *  - Elimina un modello dell'azienda (quelli di serie sono protetti)
 *
 * Permessi: la pagina si apre con «Branding & Template» in vista. Chi lo ha solo in vista consulta
 * (elenco, anteprima, campi); chi lo ha in modifica attiva, copia, crea, modifica ed elimina.
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  ClipboardList, Copy, Trash2, Save, Loader2, ChevronDown, ChevronUp,
  Lock, Camera, FormInput, FileEdit, Plus, AlertCircle, Eye, List,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
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

// Il tipo di campo (text, select…) a schermo si legge in italiano.
const FIELD_TYPE_LABEL: Record<string, string> = {
  text: "Testo",
  textarea: "Testo lungo",
  number: "Numero",
  dimension: "Dimensione",
  select: "Scelta singola",
  multiselect: "Scelta multipla",
  boolean: "Sì/No",
  compound_boolean: "Sì/No con sotto-campi",
  date: "Data",
  color: "Colore (RAL)",
  currency: "Valuta (€)",
};

const MSG_SOLA_LETTURA = "Non puoi modificare i modelli: serve «Branding & Template» in modifica.";

/** Un rifiuto deciso dalla pagina (permesso, dato mancante): il messaggio è già in italiano e si mostra com'è. */
class ErroreControllo extends Error {}

/**
 * Difesa oltre ai pulsanti nascosti: una funzione di scrittura chiamata senza il permesso di modifica
 * non parte e dice perché. Restituisce true se ha rifiutato.
 */
function rifiutaSolaLettura(puoModificare: boolean): boolean {
  if (puoModificare) return false;
  toast.error("Modello non modificato", { description: MSG_SOLA_LETTURA });
  return true;
}

/** Il motivo di un errore, in italiano e senza la parola «template» che l'API scrive nei suoi messaggi. */
function motivo(e: unknown, ripiego: string): string {
  if (e instanceof ErroreControllo) return e.message;
  const messaggio = e instanceof Error ? e.message : "";
  const usato = /usato da (\d+) riliev/i.exec(messaggio);
  if (usato) {
    const n = Number(usato[1]);
    return `Questo modello è già stato usato in ${n} ${n === 1 ? "sopralluogo" : "sopralluoghi"}: finché esistono non si può eliminare.`;
  }
  return userErrorMessage(e, ripiego);
}

export default function SettingsSopralluoghi() {
  const qc = useQueryClient();
  const { isFeatureEnabled } = useFeatureFlags();
  const enabled = isFeatureEnabled("surveys_module");
  // La pagina si apre con «Branding & Template» in vista: per cambiare qualcosa serve averlo in modifica.
  const permissions = usePermissions();
  const puoModificare = Boolean(permissions.isAdmin || permissions.canEditSettingsCustomization);

  const { data: templates, isLoading, isError, error, refetch } = useQuery({
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
    onSuccess: (_esito, { enabled }) => {
      toast.success(enabled ? "Modello attivato" : "Modello disattivato");
      qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
    },
    onError: (e) => toast.error("Modello non aggiornato", {
      description: motivo(e, "Non sono riuscito ad attivare o disattivare il modello. Riprova."),
    }),
  });

  const attiva = (id: string, attivo: boolean) => {
    if (rifiutaSolaLettura(puoModificare)) return;
    toggleMut.mutate({ id, enabled: attivo });
  };

  // Il titolo della pagina lo mette già il layout delle impostazioni: qui non se ne ripete uno.
  if (!enabled) {
    return (
      <Card className="max-w-3xl border-amber-200 bg-amber-50/30">
        <CardContent className="p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Modulo Sopralluoghi non attivo</p>
            <p className="text-sm text-muted-foreground mt-1">
              Le impostazioni dei sopralluoghi sono disponibili solo per le
              aziende con il modulo Sopralluoghi abilitato.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const list = templates ?? [];
  const activeCount = list.filter((t) => t.enabled_for_company).length;
  const ownCount = list.filter((t) => !t.is_system).length;
  const riepilogo = `${activeCount} ${activeCount === 1 ? "attivo" : "attivi"} su ${list.length}${
    ownCount > 0 ? ` · ${ownCount} ${ownCount === 1 ? "tuo" : "tuoi"}` : ""
  }`;

  return (
    <div className="space-y-4">
      {!puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Branding & Template" />}

      {/* Strumenti: il riepilogo a sinistra, «Nuovo modello» a destra */}
      <div className="flex flex-wrap items-center gap-3">
        {!isLoading && !isError && <p className="text-sm text-muted-foreground">{riepilogo}</p>}
        {puoModificare && (
          <Button onClick={() => setNewDialogOpen(true)} className="ml-auto gap-2">
            <Plus className="h-4 w-4" />
            Nuovo modello
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Non riesco a leggere i modelli</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="text-xs">{userErrorMessage(error, "Non sono riuscito a caricare i modelli. Riprova.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && !isError && list.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="font-semibold">Nessun modello disponibile</p>
            <p className="text-sm text-muted-foreground mt-1">
              I modelli di serie (Infissi, Bagno, Fotovoltaico, Ristrutturazione)
              dovrebbero esserci. Se non li vedi, scrivici.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Elenco dei modelli */}
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
              puoModificare={puoModificare}
              isToggling={toggleMut.isPending && toggleMut.variables?.id === t.id}
              onToggle={(en) => attiva(t.id, en)}
              onView={() => setSelected(t)}
              onEdit={t.is_system || !puoModificare ? undefined : () => setEditing(t)}
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
          puoModificare={puoModificare}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Clone dialog */}
      {cloneDialog && (
        <CloneDialog
          source={cloneDialog}
          puoModificare={puoModificare}
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

      {/* Editor a campi (solo i modelli dell'azienda) */}
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
          puoModificare={puoModificare}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Nuovo modello */}
      {newDialogOpen && (
        <NewTemplateDialog
          systemTemplates={list.filter((t) => t.is_system)}
          puoModificare={puoModificare}
          onClose={() => setNewDialogOpen(false)}
          onCreated={async (newId) => {
            setNewDialogOpen(false);
            // Attendi il refetch effettivo prima di cercare in cache
            await qc.refetchQueries({ queryKey: ["survey-templates-with-settings"] });
            const fresh = (qc.getQueryData<TemplateWithSettings[]>(["survey-templates-with-settings"]) ?? [])
              .find((t) => t.id === newId);
            if (fresh) setEditing(fresh);
            else toast.success("Modello creato. Modificalo dalla lista.");
          }}
        />
      )}

      {/* Delete confirm */}
      {deleteDialog && (
        <AlertDialog open onOpenChange={() => setDeleteDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare «{deleteDialog.name}»?</AlertDialogTitle>
              <AlertDialogDescription>
                Il modello verrà eliminato per sempre. Si può eliminare solo un modello che nessun sopralluogo ha mai usato.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700"
                onClick={async () => {
                  if (rifiutaSolaLettura(puoModificare)) return;
                  try {
                    await deleteTemplate(deleteDialog.id);
                    toast.success("Modello eliminato");
                    qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
                    setDeleteDialog(null);
                  } catch (e) {
                    toast.error("Modello non eliminato", {
                      description: motivo(e, "Non sono riuscito a eliminare il modello. Riprova."),
                    });
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
  template, puoModificare, isToggling, onToggle, onView, onEdit, onPreview, onClone, onDelete,
}: {
  template: TemplateWithSettings;
  puoModificare: boolean;
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

  const statoId = `modello-stato-${template.id}`;

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
              <Badge variant="secondary" className="text-[10px]">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Di serie
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                <FileEdit className="h-2.5 w-2.5 mr-0.5" />
                Tuo
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
                disabled={!puoModificare}
                onCheckedChange={onToggle}
                aria-label={`Usa il modello ${template.name}`}
                aria-describedby={statoId}
              />
              <span id={statoId} className="text-[11px] text-muted-foreground">
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
            className="gap-1"
            onClick={onPreview}
            title="Prova il modello come lo vede il tecnico"
            aria-label="Anteprima"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anteprima</span>
          </Button>
          {onEdit ? (
            <Button variant="default" size="sm" className="gap-1" onClick={onEdit} aria-label="Modifica">
              <FileEdit className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Modifica</span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1" onClick={onView} aria-label="Vedi i campi">
              {/* Su telefono resta solo l'icona: diversa da quella di «Anteprima», che era uguale (due occhi di fila). */}
              <List className="h-3.5 w-3.5 sm:hidden" />
              <span className="hidden sm:inline">Vedi i campi</span>
            </Button>
          )}
          {puoModificare && (
            <Button variant="outline" size="sm" className="gap-1" onClick={onClone} title="Fai una copia che puoi modificare" aria-label="Copia">
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copia</span>
            </Button>
          )}
          {puoModificare && !template.is_system && (
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

// Esportata perché si prova da sola: dalla pagina ci si arriva con «Vedi i campi».
export function TemplateDetailDialog({
  template, puoModificare, onClose,
}: { template: TemplateWithSettings; puoModificare: boolean; onClose: () => void }) {
  const schema = template.schema as TemplateSchema;
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const qc = useQueryClient();
  // La modifica avanzata c'è solo per i modelli dell'azienda e solo per chi può modificarli.
  const isEditable = !template.is_system && puoModificare;

  // Modifica avanzata: lo schema come testo. «Salvato» = l'ultimo testo scritto nel database (o quello di partenza).
  const [jsonText, setJsonText] = useState(() => JSON.stringify(template.schema, null, 2));
  const [jsonSalvato, setJsonSalvato] = useState(jsonText);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const confermaUscita = useSettingsDraftGuard(isEditable && jsonText !== jsonSalvato);

  const saveSchemaMut = useMutation({
    mutationFn: async () => {
      if (!puoModificare) throw new ErroreControllo(MSG_SOLA_LETTURA);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        throw new ErroreControllo(
          `Errore di sintassi: controlla virgole, parentesi e virgolette. Nulla è stato salvato. (${e instanceof Error ? e.message : String(e)})`,
          { cause: e },
        );
      }
      await updateTemplate(template.id, { schema: parsed });
    },
    onSuccess: () => {
      toast.success("Modifica avanzata salvata");
      qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
      setJsonError(null);
      setJsonSalvato(jsonText);
    },
    onError: (e) => {
      const msg = motivo(e, "Non sono riuscito a salvare la modifica. Riprova.");
      setJsonError(msg);
      toast.error("Modifica avanzata non salvata", { description: msg });
    },
  });

  const chiudi = () => {
    if (saveSchemaMut.isPending) return;
    if (confermaUscita()) onClose();
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) chiudi(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="text-2xl">{CATEGORY_ICON[template.category] ?? "📋"}</span>
            {template.name}
            {template.is_system && (
              <Badge variant="secondary" className="text-[10px]">
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                Di serie: si può solo copiare
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {template.description ?? "Tutti i campi del modello"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5 py-3">
          <div className="space-y-4 pb-3">
            {/* Sezioni iniziali */}
            {(schema?.header_schema?.length ?? 0) > 0 && (
              <section>
                <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-1.5">
                  <FormInput className="h-3.5 w-3.5" />
                  Sezioni iniziali ({schema.header_schema.length})
                </h3>
                <div className="space-y-1.5">
                  {schema.header_schema.map((sec) => {
                    const k = `h-${sec.key}`;
                    const open = expandedSection === k;
                    return (
                      <div key={k} className="border rounded-md overflow-hidden">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-100 p-2.5 text-left"
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
                                <Badge variant="outline" className="text-[10px]">{FIELD_TYPE_LABEL[f.type] ?? f.type}</Badge>
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
                  <p><span className="font-semibold">Nome al singolare:</span> {schema.area_definition.label}</p>
                  <p><span className="font-semibold">Nome al plurale:</span> {schema.area_definition.label_plural}</p>
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
                          className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-100 p-2.5 text-left"
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
                                      <Badge variant="outline" className="text-[10px]">{FIELD_TYPE_LABEL[f.type] ?? f.type}</Badge>
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

            {/* Modifica avanzata — solo per i modelli dell'azienda e per chi può modificarli */}
            {isEditable && (
              <section className="pt-4 border-t">
                <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-1.5">
                  <FileEdit className="h-3.5 w-3.5" />
                  Modifica avanzata (solo per tecnici)
                </h3>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Per chi conosce la struttura del modello: modifica direttamente il suo schema (JSON).
                  Un errore di sintassi blocca il salvataggio. Per vedere come è fatto, copia un modello di serie.
                </p>
                <Textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={16}
                  aria-label="Schema del modello"
                  className="font-mono text-[11px]"
                />
                {jsonError && (
                  <p className="text-xs text-rose-600 mt-1">{jsonError}</p>
                )}
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={() => saveSchemaMut.mutate()}
                    disabled={saveSchemaMut.isPending}
                    className="gap-1.5"
                  >
                    {saveSchemaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salva modifica avanzata
                  </Button>
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={chiudi}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function NewTemplateDialog({
  systemTemplates, puoModificare, onClose, onCreated,
}: {
  systemTemplates: TemplateWithSettings[];
  puoModificare: boolean;
  onClose: () => void;
  onCreated: (newId: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"blank" | "clone">("blank");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("custom");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState<string>("");
  // Vale come «bozza» appena si cambia qualcosa rispetto alla finestra appena aperta.
  const modificato = mode !== "blank" || name !== "" || category !== "custom" || description !== "" || sourceId !== "";
  const confermaUscita = useSettingsDraftGuard(modificato);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new ErroreControllo("Scrivi il nome del modello.");
      if (mode === "clone") {
        if (!sourceId) throw new ErroreControllo("Scegli il modello di serie da copiare.");
        return cloneTemplate(sourceId, name);
      }
      return createBlankTemplate({ name, category, description: description || null });
    },
    onSuccess: (id) => {
      toast.success(mode === "clone" ? "Modello copiato: ora puoi personalizzarlo" : "Modello creato");
      onCreated(id);
    },
    onError: (e) => toast.error("Modello non creato", {
      description: motivo(e, "Non sono riuscito a creare il modello. Riprova."),
    }),
  });

  const chiudi = () => {
    if (createMut.isPending) return;
    if (confermaUscita()) onClose();
  };

  const crea = () => {
    if (rifiutaSolaLettura(puoModificare)) return;
    createMut.mutate();
  };

  const canSubmit = name.trim().length >= 3 && (mode === "blank" || sourceId);

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) chiudi(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-orange-600" />
            Nuovo modello di sopralluogo
          </DialogTitle>
          <DialogDescription>
            Parti da zero o da un modello di serie e personalizzalo.
          </DialogDescription>
        </DialogHeader>

        {/* Mode picker */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("blank")}
            aria-pressed={mode === "blank"}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              mode === "blank" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/40",
            )}
          >
            <FileEdit className="h-5 w-5 text-primary mb-1" />
            <p className="font-semibold text-sm">Da zero</p>
            <p className="text-[11px] text-muted-foreground">Modello vuoto: aggiungi tu sezioni, campi e foto</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("clone")}
            aria-pressed={mode === "clone"}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-all",
              mode === "clone" ? "border-primary bg-primary/5" : "border-muted hover:border-primary/40",
            )}
          >
            <Copy className="h-5 w-5 text-primary mb-1" />
            <p className="font-semibold text-sm">Parti da uno di serie</p>
            <p className="text-[11px] text-muted-foreground">Copia un modello di serie (Infissi, Bagno…) e cambialo</p>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="nuovo-modello-nome" className="text-xs">Nome del nuovo modello</Label>
            <Input
              id="nuovo-modello-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Rilievo Infissi Personalizzato"
            />
          </div>

          {mode === "blank" && (
            <>
              <div>
                <Label htmlFor="nuovo-modello-categoria" className="text-xs">Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="nuovo-modello-categoria"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      ["custom", "📋 Altro"],
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
                <Label htmlFor="nuovo-modello-descrizione" className="text-xs">Descrizione (facoltativa)</Label>
                <Textarea
                  id="nuovo-modello-descrizione"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Cosa si rileva con questo modello e quando usarlo"
                />
              </div>
            </>
          )}

          {mode === "clone" && (
            <div>
              <Label htmlFor="nuovo-modello-origine" className="text-xs">Modello di serie da copiare</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger id="nuovo-modello-origine"><SelectValue placeholder="Scegli un modello…" /></SelectTrigger>
                <SelectContent>
                  {systemTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Ne verrà creata una copia completa che potrai modificare.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button
            onClick={crea}
            disabled={!canSubmit || createMut.isPending}
            className="gap-1.5"
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {mode === "clone" ? "Copia e modifica" : "Crea e modifica"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloneDialog({
  source, puoModificare, onClose, onCloned,
}: {
  source: TemplateWithSettings;
  puoModificare: boolean;
  onClose: () => void;
  onCloned: (newId: string) => void;
}) {
  const nomeIniziale = `Copia di ${source.name}`;
  const [name, setName] = useState(nomeIniziale);
  const confermaUscita = useSettingsDraftGuard(name !== nomeIniziale);
  const cloneMut = useMutation({
    mutationFn: () => cloneTemplate(source.id, name),
    onSuccess: (newId) => {
      toast.success("Modello copiato: ora puoi personalizzarlo");
      onCloned(newId);
    },
    onError: (e) => toast.error("Copia non riuscita", {
      description: motivo(e, "Non sono riuscito a copiare il modello. Riprova."),
    }),
  });

  const chiudi = () => {
    if (cloneMut.isPending) return;
    if (confermaUscita()) onClose();
  };

  const copia = () => {
    if (rifiutaSolaLettura(puoModificare)) return;
    cloneMut.mutate();
  };

  return (
    <Dialog open onOpenChange={(aperta) => { if (!aperta) chiudi(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-orange-600" />
            Copia «{source.name}»
          </DialogTitle>
          <DialogDescription>
            Fai una copia che puoi modificare: campi, foto richieste, sezioni.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="copia-modello-nome" className="text-xs">Nome del nuovo modello</Label>
            <Input
              id="copia-modello-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Rilievo Infissi Personalizzato"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={chiudi}>Annulla</Button>
          <Button
            onClick={copia}
            disabled={!name.trim() || cloneMut.isPending}
            className="gap-1.5"
          >
            {cloneMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Copia e crea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
