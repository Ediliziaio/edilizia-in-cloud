/**
 * SchedaTecnicaEditor — Editor della scheda tecnica per una macrocategoria.
 *
 * Permette di definire i "campi descrittivi tipizzati" che ogni articolo
 * (famiglia) di questa macrocategoria avrà. Esempio:
 *   - "Infissi" → vetro, trasmittanza Uw, materiale profilo, colori...
 *   - "Pannelli FV" → potenza Wp, efficienza, tecnologia celle...
 *
 * I valori per ogni famiglia vivono in `article_families.custom_field_values`
 * JSONB con chiave = `field_key`. Lo schema è definito qui.
 *
 * Use case principali:
 *   1) Bootstrap: pulsante "Genera scheda standard" che usa la RPC
 *      `seed_macro_fields_from_vertical` per popolare i campi tipici del
 *      verticale primario.
 *   2) CRUD manuale: aggiungi/modifica/elimina singoli campi.
 *   3) Toggle visibility: `show_in_picker` (visibile nella card del picker
 *      durante il preventivo) e `show_in_pdf` (stampato nel preventivo).
 */
import { useState } from "react";
import { Plus, Trash2, Edit2, Wand2, GripVertical, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useMacroFields, useCreateMacroField, useUpdateMacroField,
  useDeleteMacroField, useSeedMacroFields,
} from "@/lib/serramenti/queries";
import type { ListinoMacroField, ListinoFieldType, ListinoFieldOption } from "@/lib/serramenti/api";

const FIELD_TYPES: { value: ListinoFieldType; label: string; hint: string }[] = [
  { value: "text", label: "Testo libero", hint: "Una riga di testo (es. nome modello)" },
  { value: "textarea", label: "Testo lungo", hint: "Note multi-riga" },
  { value: "number", label: "Numero", hint: "Valori numerici (es. Uw, potenza)" },
  { value: "select", label: "Scelta singola", hint: "Una sola opzione da una lista" },
  { value: "multiselect", label: "Scelta multipla", hint: "Più opzioni selezionabili" },
  { value: "boolean", label: "Sì / No", hint: "Switch on/off" },
  { value: "color", label: "Colore", hint: "Selettore colore (RAL/hex)" },
];

const VERTICAL_PRESETS = [
  { value: "serramentista", label: "Serramenti (infissi, persiane, cassonetti)" },
  { value: "fotovoltaico", label: "Fotovoltaico (pannelli, inverter, accumulo)" },
  { value: "bagno", label: "Bagno (sanitari, box doccia, rubinetteria)" },
  { value: "tetti", label: "Tetti (coperture, isolanti, lattoneria)" },
];

interface Props {
  macroId: string;
  macroNome: string;
  open: boolean;
  onClose: () => void;
}

interface FieldFormState {
  field_key: string;
  field_label: string;
  field_type: ListinoFieldType;
  field_unit: string;
  field_placeholder: string;
  field_help: string;
  options_text: string;          // CSV editato dall'utente: "doppio,Doppio\nbe,Basso-emissivo"
  required: boolean;
  show_in_picker: boolean;
  show_in_pdf: boolean;
}

const EMPTY_FIELD_FORM: FieldFormState = {
  field_key: "",
  field_label: "",
  field_type: "text",
  field_unit: "",
  field_placeholder: "",
  field_help: "",
  options_text: "",
  required: false,
  show_in_picker: true,
  show_in_pdf: true,
};

// Genera field_key da label (lowercase, snake_case, no accenti)
function slugify(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .substring(0, 60);
}

function optionsToText(opts: ListinoFieldOption[]): string {
  return opts.map((o) => `${o.value},${o.label}`).join("\n");
}

function textToOptions(text: string): ListinoFieldOption[] {
  return text.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(",");
      if (idx < 0) return { value: slugify(line), label: line };
      return { value: line.substring(0, idx).trim(), label: line.substring(idx + 1).trim() };
    });
}

export function SchedaTecnicaEditor({ macroId, macroNome, open, onClose }: Props) {
  const { data: fields = [], isLoading } = useMacroFields(macroId);
  const createField = useCreateMacroField(macroId);
  const updateField = useUpdateMacroField(macroId);
  const deleteField = useDeleteMacroField(macroId);
  const seedFields = useSeedMacroFields(macroId);

  const [editingFieldId, setEditingFieldId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FieldFormState>(EMPTY_FIELD_FORM);
  const [seedVertical, setSeedVertical] = useState<string>("serramentista");
  const [showSeedPanel, setShowSeedPanel] = useState(false);

  const openNew = () => {
    setForm(EMPTY_FIELD_FORM);
    setEditingFieldId("new");
  };

  const openEdit = (f: ListinoMacroField) => {
    setForm({
      field_key: f.field_key,
      field_label: f.field_label,
      field_type: f.field_type,
      field_unit: f.field_unit ?? "",
      field_placeholder: f.field_placeholder ?? "",
      field_help: f.field_help ?? "",
      options_text: optionsToText(f.field_options ?? []),
      required: f.required,
      show_in_picker: f.show_in_picker,
      show_in_pdf: f.show_in_pdf,
    });
    setEditingFieldId(f.id);
  };

  const closeFieldDialog = () => {
    setEditingFieldId(null);
    setForm(EMPTY_FIELD_FORM);
  };

  const handleSaveField = async () => {
    const label = form.field_label.trim();
    if (!label) return;
    const key = form.field_key.trim() || slugify(label);
    const needsOptions = form.field_type === "select" || form.field_type === "multiselect";
    const options = needsOptions ? textToOptions(form.options_text) : [];

    const payload = {
      macrocategoria_id: macroId,
      field_key: key,
      field_label: label,
      field_type: form.field_type,
      field_unit: form.field_unit.trim() || null,
      field_options: options,
      field_placeholder: form.field_placeholder.trim() || null,
      field_help: form.field_help.trim() || null,
      required: form.required,
      show_in_picker: form.show_in_picker,
      show_in_pdf: form.show_in_pdf,
      sort_order: fields.length * 10,
    };

    if (editingFieldId === "new") {
      await createField.mutateAsync(payload);
    } else if (editingFieldId) {
      // sort_order non lo tocchiamo in update (gestito dal drag in futuro)
      const { sort_order: _ignored, ...patch } = payload;
      void _ignored;
      await updateField.mutateAsync({ id: editingFieldId, patch });
    }
    closeFieldDialog();
  };

  const handleSeed = async () => {
    await seedFields.mutateAsync({ vertical: seedVertical });
    setShowSeedPanel(false);
  };

  const fieldDialogTitle = editingFieldId === "new" ? "Nuovo campo scheda tecnica" : "Modifica campo";
  const needsOptions = form.field_type === "select" || form.field_type === "multiselect";

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                <Settings2 className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  Scheda tecnica · <span className="text-orange-600 dark:text-orange-400">{macroNome}</span>
                </DialogTitle>
                <DialogDescription>
                  Definisci i campi che descriveranno tecnicamente ogni articolo
                  di questa macrocategoria (vetro, Uw, potenza…). Verranno mostrati
                  al commerciale nel picker e stampati nel PDF preventivo.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Caricamento scheda tecnica…
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toolbar — stat live + azioni */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {fields.length} {fields.length === 1 ? "campo" : "campi"} configurati
                  </span>
                  {fields.length > 0 && (
                    <>
                      <span className="text-muted-foreground hidden sm:inline">·</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {fields.filter((f) => f.required).length} obbligatori
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSeedPanel((v) => !v)}
                    disabled={seedFields.isPending}
                    className="border-orange-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 dark:border-orange-900/50 dark:hover:bg-orange-950/40"
                  >
                    <Wand2 className="h-4 w-4 mr-1.5" />
                    {fields.length === 0 ? "Inizia con uno standard" : "Genera standard"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={openNew}
                    className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> Aggiungi campo
                  </Button>
                </div>
              </div>

              {/* Seed panel — colori coerenti arancione */}
              {showSeedPanel && (
                <div className="rounded-md border border-orange-200 bg-orange-50/60 dark:border-orange-900/50 dark:bg-orange-950/20 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wand2 className="h-4 w-4 text-orange-600" />
                    Genera campi standard per il verticale
                  </div>
                  <Select value={seedVertical} onValueChange={setSeedVertical}>
                    <SelectTrigger className="bg-white dark:bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VERTICAL_PRESETS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    Aggiungerà i campi tipici del verticale. I campi già esistenti
                    non vengono duplicati. Puoi modificarli o eliminarli singolarmente dopo.
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowSeedPanel(false)}>
                      Annulla
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSeed}
                      disabled={seedFields.isPending}
                      className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white"
                    >
                      {seedFields.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      Genera campi
                    </Button>
                  </div>
                </div>
              )}

              {/* Stato vuoto guidato — invita all'azione */}
              {fields.length === 0 && !showSeedPanel && (
                <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50/30 dark:border-orange-900/40 dark:bg-orange-950/10 p-6 text-center space-y-3">
                  <Settings2 className="h-10 w-10 mx-auto text-orange-400 opacity-60" />
                  <div>
                    <p className="font-medium text-foreground">Nessun campo configurato</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                      Aggiungi i campi tecnici che descriveranno gli articoli di questa
                      macrocategoria. Suggerimento: parti da uno standard pre-configurato
                      e poi personalizzalo.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => setShowSeedPanel(true)}
                      className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white"
                    >
                      <Wand2 className="h-4 w-4 mr-1.5" />
                      Usa scheda standard
                    </Button>
                    <Button size="sm" variant="outline" onClick={openNew}>
                      <Plus className="h-4 w-4 mr-1.5" /> Crea manualmente
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista campi — design rifinito coerente con palette listino */}
              {fields.length > 0 && (
                <div className="space-y-2">
                  {fields.map((f, idx) => (
                    <div
                      key={f.id}
                      className="flex items-start gap-2 rounded-lg border bg-card p-2.5 hover:shadow-sm transition-shadow group"
                    >
                      {/* Drag handle + numero */}
                      <div className="flex flex-col items-center pt-1 pr-1 select-none">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab" />
                        <span className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Header riga: label + tipo + unità + required */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-sm">{f.field_label}</span>
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                          >
                            {FIELD_TYPES.find((t) => t.value === f.field_type)?.label ?? f.field_type}
                          </Badge>
                          {f.field_unit && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-300 font-mono"
                            >
                              {f.field_unit}
                            </Badge>
                          )}
                          {f.required && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300"
                            >
                              obbligatorio
                            </Badge>
                          )}
                        </div>

                        {/* field_key in piccolo */}
                        <div className="text-[10px] text-muted-foreground/80 font-mono">
                          {f.field_key}
                        </div>

                        {/* Opzioni come chip */}
                        {(f.field_type === "select" || f.field_type === "multiselect") && (f.field_options?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(f.field_options ?? []).slice(0, 6).map((o) => (
                              <span
                                key={o.value}
                                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-800 border border-orange-100 dark:bg-orange-950/30 dark:text-orange-200 dark:border-orange-900/40"
                              >
                                {o.label}
                              </span>
                            ))}
                            {(f.field_options?.length ?? 0) > 6 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{(f.field_options?.length ?? 0) - 6}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Visibilità */}
                        <div className="flex flex-wrap items-center gap-2 text-[10px]">
                          <span className={`inline-flex items-center gap-1 ${f.show_in_picker ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/70 line-through"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${f.show_in_picker ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                            Picker
                          </span>
                          <span className={`inline-flex items-center gap-1 ${f.show_in_pdf ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/70 line-through"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${f.show_in_pdf ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                            PDF
                          </span>
                          {f.field_help && (
                            <span className="text-muted-foreground italic line-clamp-1">
                              · {f.field_help}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(f)} title="Modifica">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Elimina"
                          onClick={() => {
                            if (confirm(`Eliminare il campo "${f.field_label}"?`)) {
                              void deleteField.mutateAsync(f.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog campo (new/edit) */}
      <Dialog open={editingFieldId !== null} onOpenChange={(o) => { if (!o) closeFieldDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                {editingFieldId === "new" ? (
                  <Plus className="h-4.5 w-4.5 text-white" />
                ) : (
                  <Edit2 className="h-4 w-4 text-white" />
                )}
              </div>
              <div>
                <DialogTitle>{fieldDialogTitle}</DialogTitle>
                <DialogDescription className="text-xs">
                  Configura un campo della scheda tecnica. Il tipo determina come
                  apparirà nel form articolo (Input numerico, dropdown, switch…).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Etichetta visibile *</Label>
              <Input
                value={form.field_label}
                onChange={(e) => {
                  const label = e.target.value;
                  setForm((p) => ({
                    ...p,
                    field_label: label,
                    // Se l'utente non ha mai toccato field_key, autogenera
                    field_key: editingFieldId === "new" && !p.field_key
                      ? slugify(label)
                      : p.field_key,
                  }));
                }}
                placeholder="es. Trasmittanza Uw"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={form.field_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, field_type: v as ListinoFieldType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unità di misura</Label>
                <Input
                  value={form.field_unit}
                  onChange={(e) => setForm((p) => ({ ...p, field_unit: e.target.value }))}
                  placeholder="es. W/m²K, mm, Wp"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Chiave tecnica (snake_case)</Label>
              <Input
                value={form.field_key}
                onChange={(e) => setForm((p) => ({ ...p, field_key: slugify(e.target.value) }))}
                placeholder="es. trasmittanza_uw"
                className="font-mono text-xs"
              />
            </div>
            {needsOptions && (
              <div>
                <Label>Opzioni (una per riga, formato <code>chiave,etichetta</code>)</Label>
                <Textarea
                  value={form.options_text}
                  onChange={(e) => setForm((p) => ({ ...p, options_text: e.target.value }))}
                  rows={5}
                  placeholder="doppio,Doppio&#10;triplo,Triplo basso-emissivo&#10;antifurto,Antifurto stratificato"
                  className="font-mono text-xs"
                />
              </div>
            )}
            <div>
              <Label>Testo di aiuto (opzionale)</Label>
              <Input
                value={form.field_help}
                onChange={(e) => setForm((p) => ({ ...p, field_help: e.target.value }))}
                placeholder="Mostrato sotto il campo nel form"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={form.required}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, required: v }))}
                />
                <span className="text-sm">Obbligatorio</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={form.show_in_picker}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, show_in_picker: v }))}
                />
                <span className="text-sm">Mostra nel picker</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={form.show_in_pdf}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, show_in_pdf: v }))}
                />
                <span className="text-sm">Mostra in PDF</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeFieldDialog}>Annulla</Button>
            <Button
              onClick={handleSaveField}
              disabled={!form.field_label.trim() || createField.isPending || updateField.isPending}
              className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
            >
              {(createField.isPending || updateField.isPending) && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Salva campo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
