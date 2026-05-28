/**
 * SurveyTemplateEditor — editor visuale del template sopralluogo
 *
 * Modifica:
 *  - Info generali (nome, descrizione, categoria, label area/elemento)
 *  - Sezioni Header (add/rename/remove + campi per sezione)
 *  - Definizione Area (label, plurale, suggerimenti, campi)
 *  - Tipologie elementi (add/rename/remove + sezioni + campi + foto richieste)
 *  - Foto generali (a livello sopralluogo)
 *
 * NB: solo template company-owned (is_system=false) sono editabili.
 * Per i system: forza clone prima di editare.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTemplate } from "@/lib/api/surveys";
import type {
  TemplateSchema, FieldSection, FieldDefinition, ElementTypeDefinition,
  AreaDefinition, PhotoChecklistItem, FieldType, SurveyCategory,
} from "@/types/surveys";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent,
} from "@/components/ui/card";
import {
  Plus, Trash2, ChevronDown, ChevronRight, ChevronUp, Save, Loader2,
  Settings, FormInput, MapPin, Boxes, Camera, GripVertical, Pencil, X,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES: { value: SurveyCategory; label: string; emoji: string }[] = [
  { value: "infissi",          label: "Infissi",          emoji: "🪟" },
  { value: "bagno",            label: "Bagno",            emoji: "🛁" },
  { value: "fotovoltaico",     label: "Fotovoltaico",     emoji: "☀️" },
  { value: "ristrutturazione", label: "Ristrutturazione", emoji: "🏗️" },
  { value: "cucina",           label: "Cucina",           emoji: "🍳" },
  { value: "cappotto",         label: "Cappotto",         emoji: "🏠" },
  { value: "tetto",            label: "Tetto",            emoji: "🏘️" },
  { value: "impianti",         label: "Impianti",         emoji: "⚡" },
  { value: "pavimentazioni",   label: "Pavimentazioni",   emoji: "🪜" },
  { value: "porte_interne",    label: "Porte interne",    emoji: "🚪" },
  { value: "climatizzazione",  label: "Climatizzazione",  emoji: "❄️" },
  { value: "custom",           label: "Custom",           emoji: "📋" },
];

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text",             label: "Testo" },
  { value: "textarea",         label: "Testo lungo" },
  { value: "number",           label: "Numero" },
  { value: "dimension",        label: "Dimensione (con unità)" },
  { value: "select",           label: "Scelta singola" },
  { value: "multiselect",      label: "Scelta multipla" },
  { value: "boolean",          label: "Sì/No" },
  { value: "compound_boolean", label: "Sì/No con sotto-campi" },
  { value: "date",             label: "Data" },
  { value: "color",            label: "Colore (RAL)" },
  { value: "currency",         label: "Valuta (€)" },
];

// ─────────────────────────────────────────────────────────────────────────────

interface SurveyTemplateEditorProps {
  templateId: string;
  initialName: string;
  initialDescription: string | null;
  initialCategory: SurveyCategory;
  initialAreaLabel: string;
  initialAreaLabelPlural: string;
  initialElementLabel: string;
  initialSchema: TemplateSchema;
  onClose: () => void;
}

export function SurveyTemplateEditor({
  templateId, initialName, initialDescription, initialCategory,
  initialAreaLabel, initialAreaLabelPlural, initialElementLabel,
  initialSchema, onClose,
}: SurveyTemplateEditorProps) {
  const qc = useQueryClient();

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [category, setCategory] = useState<SurveyCategory>(initialCategory);
  const [areaLabel, setAreaLabel] = useState(initialAreaLabel);
  const [areaLabelPlural, setAreaLabelPlural] = useState(initialAreaLabelPlural);
  const [elementLabel, setElementLabel] = useState(initialElementLabel);

  // Schema components
  const [headerSchema, setHeaderSchema] = useState<FieldSection[]>(
    initialSchema?.header_schema ?? [],
  );
  const [areaDefinition, setAreaDefinition] = useState<AreaDefinition>(
    initialSchema?.area_definition ?? {
      label: "Area", label_plural: "Aree", fields: [],
    },
  );
  const [elementTypes, setElementTypes] = useState<ElementTypeDefinition[]>(
    initialSchema?.element_types ?? [],
  );
  const [generalPhotos, setGeneralPhotos] = useState<PhotoChecklistItem[]>(
    initialSchema?.general_required_photos ?? [],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const schema: TemplateSchema = {
        version: 1,
        header_schema: headerSchema,
        area_definition: areaDefinition,
        element_types: elementTypes,
        general_required_photos: generalPhotos,
        output_mapping: initialSchema?.output_mapping,
      };
      await updateTemplate(templateId, {
        name: name.trim(),
        description: description.trim() || null,
        category,
        area_label: areaLabel.trim() || "Area",
        area_label_plural: areaLabelPlural.trim() || "Aree",
        element_label: elementLabel.trim() || "Elemento",
        schema,
      });
    },
    onSuccess: () => {
      toast.success("Template aggiornato");
      qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
      onClose();
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: String(e) }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-orange-600" />
            Modifica template
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-3">
            <TabsTrigger value="general" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Generale</TabsTrigger>
            <TabsTrigger value="header" className="gap-1.5"><FormInput className="h-3.5 w-3.5" /> Header ({headerSchema.length})</TabsTrigger>
            <TabsTrigger value="area" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Aree</TabsTrigger>
            <TabsTrigger value="elements" className="gap-1.5"><Boxes className="h-3.5 w-3.5" /> Elementi ({elementTypes.length})</TabsTrigger>
            <TabsTrigger value="photos" className="gap-1.5"><Camera className="h-3.5 w-3.5" /> Foto generali ({generalPhotos.length})</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <TabsContent value="general" className="mt-0 space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-8">
                    <Label className="text-xs">Nome template</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as SurveyCategory)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.emoji} {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12">
                    <Label className="text-xs">Descrizione</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder="Quando usare questo template e a chi è rivolto"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">Etichetta area (singolare)</Label>
                    <Input value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder="Stanza, Falda, Facciata" />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">Etichetta area (plurale)</Label>
                    <Input value={areaLabelPlural} onChange={(e) => setAreaLabelPlural(e.target.value)} placeholder="Stanze, Falde, Facciate" />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-xs">Etichetta elemento</Label>
                    <Input value={elementLabel} onChange={(e) => setElementLabel(e.target.value)} placeholder="Infisso, Sanitario, Pannello" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="header" className="mt-0">
                <SectionListEditor sections={headerSchema} onChange={setHeaderSchema} />
              </TabsContent>

              <TabsContent value="area" className="mt-0 space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6">
                    <Label className="text-xs">Label area singolare</Label>
                    <Input
                      value={areaDefinition.label}
                      onChange={(e) => setAreaDefinition({ ...areaDefinition, label: e.target.value })}
                    />
                  </div>
                  <div className="col-span-6">
                    <Label className="text-xs">Label area plurale</Label>
                    <Input
                      value={areaDefinition.label_plural}
                      onChange={(e) => setAreaDefinition({ ...areaDefinition, label_plural: e.target.value })}
                    />
                  </div>
                  <div className="col-span-12">
                    <Label className="text-xs">Suggerimenti nomi (uno per riga)</Label>
                    <Textarea
                      value={(areaDefinition.name_suggestions ?? []).join("\n")}
                      onChange={(e) => setAreaDefinition({
                        ...areaDefinition,
                        name_suggestions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                      })}
                      placeholder="Soggiorno&#10;Cucina&#10;Bagno"
                      rows={4}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Campi area</Label>
                  <FieldsEditor
                    fields={areaDefinition.fields ?? []}
                    onChange={(fields) => setAreaDefinition({ ...areaDefinition, fields })}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Foto richieste per area</Label>
                  <PhotosEditor
                    photos={areaDefinition.required_photos ?? []}
                    onChange={(photos) => setAreaDefinition({ ...areaDefinition, required_photos: photos })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="elements" className="mt-0">
                <ElementTypesEditor elementTypes={elementTypes} onChange={setElementTypes} />
              </TabsContent>

              <TabsContent value="photos" className="mt-0">
                <PhotosEditor photos={generalPhotos} onChange={setGeneralPhotos} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !name.trim()}
            className="gap-1.5 bg-orange-600 hover:bg-orange-700"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION LIST EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function SectionListEditor({
  sections, onChange,
}: { sections: FieldSection[]; onChange: (s: FieldSection[]) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const addSection = () => {
    const key = `section_${Date.now()}`;
    onChange([...sections, { key, label: "Nuova sezione", fields: [] }]);
    setExpanded(key);
  };

  const updateSection = (idx: number, patch: Partial<FieldSection>) => {
    const next = [...sections];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeSection = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const next = [...sections];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {sections.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Nessuna sezione. Aggiungine una per iniziare.
        </p>
      )}
      {sections.map((sec, idx) => {
        const open = expanded === sec.key;
        return (
          <Card key={sec.key} className="overflow-hidden">
            <div className="flex items-center gap-2 p-2 bg-muted/30">
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 cursor-grab" disabled>
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : sec.key)}
                className="flex items-center gap-1 flex-1 text-left"
              >
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="font-semibold text-sm">{sec.label}</span>
                <Badge variant="outline" className="text-[10px] ml-1">
                  {sec.fields?.length ?? 0} campi
                </Badge>
              </button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => move(idx, 1)} disabled={idx === sections.length - 1}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 text-rose-600" onClick={() => removeSection(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {open && (
              <CardContent className="p-3 space-y-3">
                <div>
                  <Label className="text-xs">Titolo sezione</Label>
                  <Input
                    value={sec.label}
                    onChange={(e) => updateSection(idx, { label: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Descrizione (opz.)</Label>
                  <Input
                    value={sec.description ?? ""}
                    onChange={(e) => updateSection(idx, { description: e.target.value })}
                  />
                </div>
                <FieldsEditor
                  fields={sec.fields ?? []}
                  onChange={(f) => updateSection(idx, { fields: f })}
                />
              </CardContent>
            )}
          </Card>
        );
      })}
      <Button variant="outline" onClick={addSection} className="w-full gap-2 border-dashed">
        <Plus className="h-3.5 w-3.5" /> Aggiungi sezione
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELDS EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function FieldsEditor({
  fields, onChange,
}: { fields: FieldDefinition[]; onChange: (f: FieldDefinition[]) => void }) {
  const addField = () => {
    const key = `field_${Date.now()}`;
    onChange([...fields, { key, label: "Nuovo campo", type: "text", width: 12 }]);
  };

  const updateField = (idx: number, patch: Partial<FieldDefinition>) => {
    const next = [...fields];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeField = (idx: number) => onChange(fields.filter((_, i) => i !== idx));

  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const next = [...fields];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {fields.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">Nessun campo.</p>
      )}
      {fields.map((f, idx) => (
        <div key={f.key} className="rounded-md border bg-muted/10 p-2 space-y-2">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-5">
              <Label className="text-[10px]">Label</Label>
              <Input
                value={f.label}
                onChange={(e) => updateField(idx, { label: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label className="text-[10px]">Tipo</Label>
              <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v as FieldType })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 md:col-span-2">
              <Label className="text-[10px]">Larghezza</Label>
              <Select
                value={String(f.width ?? 12)}
                onValueChange={(v) => updateField(idx, { width: Number(v) as 3 | 4 | 6 | 8 | 12 })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">1/4</SelectItem>
                  <SelectItem value="4">1/3</SelectItem>
                  <SelectItem value="6">1/2</SelectItem>
                  <SelectItem value="8">2/3</SelectItem>
                  <SelectItem value="12">Intera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 md:col-span-1 flex items-end pb-1">
              <div className="flex flex-col items-center gap-0.5">
                <Switch
                  checked={!!f.required}
                  onCheckedChange={(v) => updateField(idx, { required: v })}
                />
                <span className="text-[8px] text-muted-foreground">Obb.</span>
              </div>
            </div>
            <div className="col-span-12 md:col-span-1 flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => move(idx, -1)} disabled={idx === 0} title="Su">
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => move(idx, 1)} disabled={idx === fields.length - 1} title="Giù">
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 text-rose-600" onClick={() => removeField(idx)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Opzioni select/multiselect */}
          {(f.type === "select" || f.type === "multiselect") && (
            <div>
              <Label className="text-[10px]">Opzioni (uno per riga, formato: valore|Etichetta)</Label>
              <Textarea
                value={(f.options ?? []).map((o) => `${o.value}|${o.label}`).join("\n")}
                onChange={(e) => updateField(idx, {
                  options: e.target.value.split("\n").filter(Boolean).map((line) => {
                    const [value, label] = line.split("|");
                    return { value: (value ?? "").trim(), label: (label ?? value ?? "").trim() };
                  }),
                })}
                rows={3}
                className="text-[11px] font-mono"
                placeholder="pvc|PVC&#10;legno|Legno&#10;alluminio|Alluminio"
              />
            </div>
          )}

          {/* Unità per dimension */}
          {f.type === "dimension" && (
            <div>
              <Label className="text-[10px]">Unità di misura</Label>
              <Select
                value={f.unit ?? "cm"}
                onValueChange={(v) => updateField(idx, { unit: v as FieldDefinition["unit"] })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["cm", "mm", "m", "mq", "ml", "kw", "kwh", "kg", "l", "gradi", "°C"].map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Altre opzioni</summary>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <div className="col-span-12">
                <Label className="text-[10px]">Testo aiuto (sotto il campo)</Label>
                <Input
                  value={f.help ?? ""}
                  onChange={(e) => updateField(idx, { help: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="col-span-12">
                <Label className="text-[10px]">Placeholder</Label>
                <Input
                  value={f.placeholder ?? ""}
                  onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="col-span-12">
                <Label className="text-[10px]">Chiave tecnica (snake_case, no spazi)</Label>
                <Input
                  value={f.key}
                  onChange={(e) => updateField(idx, { key: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })}
                  className="h-7 text-xs font-mono"
                />
              </div>
            </div>
          </details>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addField} className="w-full gap-1.5 border-dashed">
        <Plus className="h-3 w-3" /> Aggiungi campo
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTOS EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function PhotosEditor({
  photos, onChange,
}: { photos: PhotoChecklistItem[]; onChange: (p: PhotoChecklistItem[]) => void }) {
  const addPhoto = () => {
    onChange([...photos, { key: `photo_${Date.now()}`, label: "Nuova foto", required: false }]);
  };

  const updatePhoto = (idx: number, patch: Partial<PhotoChecklistItem>) => {
    const next = [...photos];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {photos.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">Nessuna foto richiesta.</p>
      )}
      {photos.map((p, idx) => (
        <div key={p.key} className="rounded-md border bg-muted/10 p-2 grid grid-cols-12 gap-2 items-end">
          <div className="col-span-12 md:col-span-5">
            <Label className="text-[10px]">Label</Label>
            <Input value={p.label} onChange={(e) => updatePhoto(idx, { label: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="col-span-12 md:col-span-5">
            <Label className="text-[10px]">Istruzione tecnico (opz.)</Label>
            <Input value={p.hint ?? ""} onChange={(e) => updatePhoto(idx, { hint: e.target.value })} className="h-8 text-xs" placeholder="Es. Frontale interna con metro" />
          </div>
          <div className="col-span-4 md:col-span-1 flex flex-col items-center gap-0.5">
            <Switch checked={!!p.required} onCheckedChange={(v) => updatePhoto(idx, { required: v })} />
            <span className="text-[8px] text-muted-foreground">Obb.</span>
          </div>
          <div className="col-span-4 md:col-span-1 flex flex-col items-center gap-0.5">
            <Switch checked={!!p.multiple} onCheckedChange={(v) => updatePhoto(idx, { multiple: v })} />
            <span className="text-[8px] text-muted-foreground">Multi</span>
          </div>
          <div className="col-span-4 md:col-span-0 flex">
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 text-rose-600" onClick={() => onChange(photos.filter((_, i) => i !== idx))}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addPhoto} className="w-full gap-1.5 border-dashed">
        <Plus className="h-3 w-3" /> Aggiungi foto richiesta
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT TYPES EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function ElementTypesEditor({
  elementTypes, onChange,
}: { elementTypes: ElementTypeDefinition[]; onChange: (e: ElementTypeDefinition[]) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const addType = () => {
    const key = `element_${Date.now()}`;
    onChange([...elementTypes, {
      key, label: "Nuovo elemento", label_plural: "Nuovi elementi",
      sections: [], required_photos: [],
    }]);
    setExpanded(key);
  };

  const updateType = (idx: number, patch: Partial<ElementTypeDefinition>) => {
    const next = [...elementTypes];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {elementTypes.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Nessuna tipologia. Aggiungi un tipo di elemento (es. "Infisso", "Sanitario", "Pannello").
        </p>
      )}
      {elementTypes.map((et, idx) => {
        const open = expanded === et.key;
        const totalFields = (et.sections ?? []).reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);
        return (
          <Card key={et.key} className="overflow-hidden">
            <div className="flex items-center gap-2 p-2 bg-muted/30">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : et.key)}
                className="flex items-center gap-1 flex-1 text-left"
              >
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="font-semibold text-sm">{et.label}</span>
                <Badge variant="outline" className="text-[10px] ml-1">
                  {et.sections?.length ?? 0} sezioni · {totalFields} campi · {et.required_photos?.length ?? 0} foto
                </Badge>
              </button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 text-rose-600" onClick={() => onChange(elementTypes.filter((_, i) => i !== idx))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {open && (
              <CardContent className="p-3 space-y-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <Label className="text-xs">Label singolare</Label>
                    <Input value={et.label} onChange={(e) => updateType(idx, { label: e.target.value })} />
                  </div>
                  <div className="col-span-6">
                    <Label className="text-xs">Label plurale</Label>
                    <Input value={et.label_plural} onChange={(e) => updateType(idx, { label_plural: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Sezioni di campi</Label>
                  <SectionListEditor
                    sections={et.sections ?? []}
                    onChange={(s) => updateType(idx, { sections: s })}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Foto richieste per questo elemento</Label>
                  <PhotosEditor
                    photos={et.required_photos ?? []}
                    onChange={(p) => updateType(idx, { required_photos: p })}
                  />
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
      <Button variant="outline" onClick={addType} className="w-full gap-2 border-dashed">
        <Plus className="h-3.5 w-3.5" /> Aggiungi tipologia elemento
      </Button>
    </div>
  );
}
