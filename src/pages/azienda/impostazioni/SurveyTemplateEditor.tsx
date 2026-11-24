/**
 * SurveyTemplateEditor — editor a campi del modello di sopralluogo
 *
 * Modifica:
 *  - Info generali (nome, descrizione, categoria, nome dell'area e dell'elemento)
 *  - Dati iniziali (aggiungi/rinomina/togli sezioni + campi per sezione)
 *  - Definizione dell'area (nome al singolare e al plurale, suggerimenti, campi)
 *  - Tipologie elementi (aggiungi/rinomina/togli + sezioni + campi + foto richieste)
 *  - Foto generali (a livello sopralluogo)
 *
 * NB: solo i modelli dell'azienda (is_system=false) si possono modificare.
 * Quelli di serie si copiano prima di cambiarli.
 *
 * Chiudere con Esc, clic fuori o «Annulla» chiede conferma se qualcosa è cambiato
 * rispetto a quando si è aperto; salvare senza il permesso di modifica non è possibile.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTemplate } from "@/lib/api/surveys";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { userErrorMessage } from "@/lib/userErrorMessage";
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
import {
  campoComanda, leggiMostraSe, limitiNumero, operatorePer, rigaDiPartenza, scriviMostraSe, segnapostoSconosciuti,
} from "@/lib/surveys/editorModello";
import type { EstimateLineMapping } from "@/types/surveys";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  { value: "pergole",          label: "Pergole e tende",  emoji: "⛱️" },
  { value: "piscine",          label: "Piscine",          emoji: "🏊" },
  { value: "custom",           label: "Altro",            emoji: "📋" },
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
  /** Chi ha «Personalizzazione» in modifica. Senza, il modello non si salva. */
  puoModificare: boolean;
  onClose: () => void;
}

const MSG_SOLA_LETTURA = "Non puoi modificare i modelli: serve «Personalizzazione» in modifica.";

export function SurveyTemplateEditor({
  templateId, initialName, initialDescription, initialCategory,
  initialAreaLabel, initialAreaLabelPlural, initialElementLabel,
  initialSchema, puoModificare, onClose,
}: SurveyTemplateEditorProps) {
  const t = useT();
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
  // Come ogni tipo di elemento diventa una riga del preventivo (lotto 6): prima si conservava
  // senza poterla vedere né cambiare.
  const [righePreventivo, setRighePreventivo] = useState<Record<string, EstimateLineMapping>>(
    initialSchema?.output_mapping?.estimate_lines ?? {},
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const schema: TemplateSchema = {
        version: 1,
        header_schema: headerSchema,
        area_definition: areaDefinition,
        element_types: elementTypes,
        general_required_photos: generalPhotos,
        output_mapping: {
          ...initialSchema?.output_mapping,
          // Solo i tipi che esistono ancora.
          estimate_lines: Object.fromEntries(Object.entries(righePreventivo).filter(([k]) => elementTypes.some((t) => t.key === k))),
        },
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
      toast.success(t("Modello salvato"));
      qc.invalidateQueries({ queryKey: ["survey-templates-with-settings"] });
      onClose();
    },
    onError: (e) => toast.error(t("Modello non salvato"), {
      description: userErrorMessage(e, t("Non sono riuscito a salvare il modello. Riprova.")),
    }),
  });

  // Bozza protetta: «cambiato» = lo stato modificabile è diverso da quello con cui si è aperto l'editor.
  const istantanea = JSON.stringify([
    name, description, category, areaLabel, areaLabelPlural, elementLabel,
    headerSchema, areaDefinition, elementTypes, generalPhotos, righePreventivo,
  ]);
  const [istantaneaIniziale] = useState(istantanea);
  const confermaUscita = useSettingsDraftGuard(saveMut.isPending || istantanea !== istantaneaIniziale);

  const chiudi = () => {
    if (saveMut.isPending) return;
    if (confermaUscita()) onClose();
  };

  const salva = () => {
    // Difesa oltre al pulsante: senza il permesso di modifica non si scrive.
    if (!puoModificare) {
      toast.error(t("Modello non modificato"), { description: t(MSG_SOLA_LETTURA) });
      return;
    }
    saveMut.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) chiudi(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4 text-orange-600" />
            {t("Modifica modello")}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-3">
            <TabsTrigger value="general" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> {t("Generale")}</TabsTrigger>
            <TabsTrigger value="header" className="gap-1.5"><FormInput className="h-3.5 w-3.5" /> {t("Dati iniziali ({n})", { n: headerSchema.length })}</TabsTrigger>
            <TabsTrigger value="area" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t("Aree")}</TabsTrigger>
            <TabsTrigger value="elements" className="gap-1.5"><Boxes className="h-3.5 w-3.5" /> {t("Elementi ({n})", { n: elementTypes.length })}</TabsTrigger>
            <TabsTrigger value="photos" className="gap-1.5"><Camera className="h-3.5 w-3.5" /> {t("Foto generali ({n})", { n: generalPhotos.length })}</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <TabsContent value="general" className="mt-0 space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-8">
                    <Label htmlFor="modello-nome" className="text-xs">{t("Nome del modello")}</Label>
                    <Input id="modello-nome" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label htmlFor="modello-categoria" className="text-xs">{t("Categoria")}</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as SurveyCategory)}>
                      <SelectTrigger id="modello-categoria"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.emoji} {t(c.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12">
                    <Label htmlFor="modello-descrizione" className="text-xs">{t("Descrizione")}</Label>
                    <Textarea
                      id="modello-descrizione"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      placeholder={t("Quando usare questo modello e a chi è rivolto")}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label htmlFor="modello-area-singolare" className="text-xs">{t("Nome dell'area al singolare")}</Label>
                    <Input id="modello-area-singolare" value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder={t("Stanza, Falda, Facciata")} />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label htmlFor="modello-area-plurale" className="text-xs">{t("Nome dell'area al plurale")}</Label>
                    <Input id="modello-area-plurale" value={areaLabelPlural} onChange={(e) => setAreaLabelPlural(e.target.value)} placeholder={t("Stanze, Falde, Facciate")} />
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Label htmlFor="modello-elemento" className="text-xs">{t("Nome dell'elemento")}</Label>
                    <Input id="modello-elemento" value={elementLabel} onChange={(e) => setElementLabel(e.target.value)} placeholder={t("Infisso, Sanitario, Pannello")} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="header" className="mt-0">
                <SectionListEditor sections={headerSchema} onChange={setHeaderSchema} />
              </TabsContent>

              <TabsContent value="area" className="mt-0 space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6">
                    <Label htmlFor="area-nome-singolare" className="text-xs">{t("Nome dell'area al singolare")}</Label>
                    <Input
                      id="area-nome-singolare"
                      value={areaDefinition.label}
                      onChange={(e) => setAreaDefinition({ ...areaDefinition, label: e.target.value })}
                    />
                  </div>
                  <div className="col-span-6">
                    <Label htmlFor="area-nome-plurale" className="text-xs">{t("Nome dell'area al plurale")}</Label>
                    <Input
                      id="area-nome-plurale"
                      value={areaDefinition.label_plural}
                      onChange={(e) => setAreaDefinition({ ...areaDefinition, label_plural: e.target.value })}
                    />
                  </div>
                  <div className="col-span-12">
                    <Label htmlFor="area-suggerimenti" className="text-xs">{t("Suggerimenti nomi (uno per riga)")}</Label>
                    <Textarea
                      id="area-suggerimenti"
                      value={(areaDefinition.name_suggestions ?? []).join("\n")}
                      onChange={(e) => setAreaDefinition({
                        ...areaDefinition,
                        name_suggestions: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                      })}
                      placeholder={t("Soggiorno\nCucina\nBagno")}
                      rows={4}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">{t("Campi area")}</Label>
                  <FieldsEditor
                    fields={areaDefinition.fields ?? []}
                    onChange={(fields) => setAreaDefinition({ ...areaDefinition, fields })}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">{t("Foto richieste per area")}</Label>
                  <PhotosEditor
                    photos={areaDefinition.required_photos ?? []}
                    onChange={(photos) => setAreaDefinition({ ...areaDefinition, required_photos: photos })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="elements" className="mt-0">
                <ElementTypesEditor elementTypes={elementTypes} onChange={setElementTypes} righe={righePreventivo} onRighe={setRighePreventivo} />
              </TabsContent>

              <TabsContent value="photos" className="mt-0">
                <PhotosEditor photos={generalPhotos} onChange={setGeneralPhotos} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={chiudi}>{t("Annulla")}</Button>
          <Button
            onClick={salva}
            disabled={saveMut.isPending || !name.trim()}
            className="gap-1.5"
          >
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("Salva modello")}
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
  const t = useT();
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
          {t("Nessuna sezione. Aggiungine una per iniziare.")}
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
                  {t("{n} campi", { n: sec.fields?.length ?? 0 })}
                </Badge>
                {sec.solo_tecnico && <Badge variant="outline" className="ml-1 border-orange-200 bg-orange-50 text-[10px] text-orange-700">Solo tecnico</Badge>}
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
                  <Label className="text-xs">{t("Titolo sezione")}</Label>
                  <Input
                    value={sec.label}
                    onChange={(e) => updateSection(idx, { label: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("Descrizione (opz.)")}</Label>
                  <Input
                    value={sec.description ?? ""}
                    onChange={(e) => updateSection(idx, { description: e.target.value })}
                  />
                </div>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <Switch checked={!!sec.solo_tecnico} onCheckedChange={(v) => updateSection(idx, { solo_tecnico: v || undefined })} aria-label={`Sezione solo nel sopralluogo tecnico: ${sec.label}`} />
                  Solo nel sopralluogo tecnico (il commerciale non vede la sezione)
                </label>
                <FieldsEditor
                  fields={sec.fields ?? []}
                  onChange={(f) => updateSection(idx, { fields: f })}
                  campiDisponibili={sections.flatMap((x) => x.fields ?? [])}
                />
              </CardContent>
            )}
          </Card>
        );
      })}
      <Button variant="outline" onClick={addSection} className="w-full gap-2 border-dashed">
        <Plus className="h-3.5 w-3.5" /> {t("Aggiungi sezione")}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELDS EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function FieldsEditor({
  fields, onChange, campiDisponibili,
}: {
  fields: FieldDefinition[];
  onChange: (f: FieldDefinition[]) => void;
  /** I campi tra cui scegliere quello che comanda «mostra solo se» (di base, quelli di questa lista). */
  campiDisponibili?: FieldDefinition[];
}) {
  const tr = useT();
  const comandanti = (campiDisponibili ?? fields).filter(campoComanda);
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
        <p className="text-[11px] text-muted-foreground italic">{tr("Nessun campo.")}</p>
      )}
      {fields.map((f, idx) => (
        <div key={f.key} className="rounded-md border bg-muted/10 p-2 space-y-2">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 md:col-span-5">
              <Label className="text-[10px]">{tr("Nome")}</Label>
              <Input
                value={f.label}
                onChange={(e) => updateField(idx, { label: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label className="text-[10px]">{tr("Tipo")}</Label>
              <Select value={f.type} onValueChange={(v) => updateField(idx, { type: v as FieldType })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{tr(t.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 md:col-span-2">
              <Label className="text-[10px]">{tr("Larghezza")}</Label>
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
                  <SelectItem value="12">{tr("Intera")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 md:col-span-1 flex items-end pb-1">
              <div className="flex flex-col items-center gap-0.5">
                <Switch
                  checked={!!f.required}
                  onCheckedChange={(v) => updateField(idx, { required: v })}
                />
                <span className="text-[8px] text-muted-foreground">{tr("Obb.")}</span>
              </div>
            </div>
            <div className="col-span-12 md:col-span-1 flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => move(idx, -1)} disabled={idx === 0} title={tr("Su")}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7" onClick={() => move(idx, 1)} disabled={idx === fields.length - 1} title={tr("Giù")}>
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
              <Label className="text-[10px]">{tr("Scelte possibili (una per riga, nel formato codice|nome da mostrare)")}</Label>
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
              <Label className="text-[10px]">{tr("Unità di misura")}</Label>
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
            <summary className="cursor-pointer text-muted-foreground">{tr("Altre opzioni")}</summary>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <div className="col-span-12">
                <Label className="text-[10px]">{tr("Testo aiuto (sotto il campo)")}</Label>
                <Input
                  value={f.help ?? ""}
                  onChange={(e) => updateField(idx, { help: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <label className="col-span-12 flex min-h-9 items-center gap-2 text-xs">
                <Switch checked={!!f.solo_tecnico} onCheckedChange={(v) => updateField(idx, { solo_tecnico: v || undefined })} aria-label={`Solo nel sopralluogo tecnico: ${f.label}`} />
                Solo nel sopralluogo tecnico (il commerciale non lo vede)
              </label>
              {(f.type === "number" || f.type === "dimension" || f.type === "currency") && (
                <LimitiCampo campo={f} onChange={(patch) => updateField(idx, patch)} />
              )}
              <MostraSeEditor campo={f} comandanti={comandanti.filter((c) => c.key !== f.key)} onChange={(r) => updateField(idx, { show_if: r })} />
              <div className="col-span-12">
                <Label className="text-[10px]">{tr("Testo di esempio nel campo")}</Label>
                <Input
                  value={f.placeholder ?? ""}
                  onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              {/* La chiave serve ai tecnici (preventivo automatico, esportazioni): chiusa di base, ma c'è. */}
              <details className="col-span-12">
                <summary className="cursor-pointer text-muted-foreground">{tr("Per i tecnici")}</summary>
                <div className="mt-2">
                  <Label className="text-[10px]">{tr("Chiave tecnica (snake_case, no spazi)")}</Label>
                  <Input
                    value={f.key}
                    onChange={(e) => updateField(idx, { key: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })}
                    className="h-7 text-xs font-mono"
                  />
                </div>
              </details>
            </div>
          </details>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addField} className="w-full gap-1.5 border-dashed">
        <Plus className="h-3 w-3" /> {tr("Aggiungi campo")}
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
  const t = useT();
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
        <p className="text-[11px] text-muted-foreground italic">{t("Nessuna foto richiesta.")}</p>
      )}
      {photos.map((p, idx) => (
        <div key={p.key} className="rounded-md border bg-muted/10 p-2 grid grid-cols-12 gap-2 items-end">
          <div className="col-span-12 md:col-span-5">
            <Label className="text-[10px]">{t("Nome")}</Label>
            <Input value={p.label} onChange={(e) => updatePhoto(idx, { label: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="col-span-12 md:col-span-5">
            <Label className="text-[10px]">{t("Istruzione tecnico (opz.)")}</Label>
            <Input value={p.hint ?? ""} onChange={(e) => updatePhoto(idx, { hint: e.target.value })} className="h-8 text-xs" placeholder={t("Es. Frontale interna con metro")} />
          </div>
          <div className="col-span-4 md:col-span-1 flex flex-col items-center gap-0.5">
            <Switch checked={!!p.required} onCheckedChange={(v) => updatePhoto(idx, { required: v })} />
            <span className="text-[8px] text-muted-foreground">{t("Obb.")}</span>
          </div>
          <div className="col-span-4 md:col-span-1 flex flex-col items-center gap-0.5">
            <Switch checked={!!p.multiple} onCheckedChange={(v) => updatePhoto(idx, { multiple: v })} />
            <span className="text-[8px] text-muted-foreground">{t("Multi")}</span>
          </div>
          <div className="col-span-4 md:col-span-0 flex">
            <Button variant="ghost" size="icon" className="h-9 w-9 md:h-7 md:w-7 text-rose-600" onClick={() => onChange(photos.filter((_, i) => i !== idx))}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addPhoto} className="w-full gap-1.5 border-dashed">
        <Plus className="h-3 w-3" /> {t("Aggiungi foto richiesta")}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT TYPES EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function ElementTypesEditor({
  elementTypes, onChange, righe, onRighe,
}: {
  elementTypes: ElementTypeDefinition[];
  onChange: (e: ElementTypeDefinition[]) => void;
  righe: Record<string, EstimateLineMapping>;
  onRighe: (r: Record<string, EstimateLineMapping>) => void;
}) {
  const t = useT();
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
          {t("Nessuna tipologia. Aggiungi un tipo di elemento (es. \"Infisso\", \"Sanitario\", \"Pannello\").")}
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
                  {t("{sezioni} sezioni · {campi} campi · {foto} foto", { sezioni: et.sections?.length ?? 0, campi: totalFields, foto: et.required_photos?.length ?? 0 })}
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
                    <Label className="text-xs">{t("Nome al singolare")}</Label>
                    <Input value={et.label} onChange={(e) => updateType(idx, { label: e.target.value })} />
                  </div>
                  <div className="col-span-6">
                    <Label className="text-xs">{t("Nome al plurale")}</Label>
                    <Input value={et.label_plural} onChange={(e) => updateType(idx, { label_plural: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">{t("Sezioni di campi")}</Label>
                  <SectionListEditor
                    sections={et.sections ?? []}
                    onChange={(s) => updateType(idx, { sections: s })}
                  />
                </div>
                <RigaPreventivoEditor
                  tipo={et}
                  riga={righe[et.key]}
                  onChange={(r) => {
                    const next = { ...righe };
                    if (r) next[et.key] = r; else delete next[et.key];
                    onRighe(next);
                  }}
                />
                <div>
                  <Label className="text-xs mb-1.5 block">{t("Foto richieste per questo elemento")}</Label>
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
        <Plus className="h-3.5 w-3.5" /> {t("Aggiungi tipologia elemento")}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOTTO 6 — condizioni, limiti, riga del preventivo
// ─────────────────────────────────────────────────────────────────────────────

function LimitiCampo({ campo, onChange }: { campo: FieldDefinition; onChange: (p: Partial<FieldDefinition>) => void }) {
  const tr = useT();
  const [min, setMin] = useState(campo.min === undefined ? "" : String(campo.min));
  const [max, setMax] = useState(campo.max === undefined ? "" : String(campo.max));
  const esito = limitiNumero(min, max);
  const scrivi = (a: string, b: string) => {
    const e = limitiNumero(a, b);
    if (!e.errore) onChange({ min: e.min, max: e.max });
  };
  return (
    <div className="col-span-12 grid grid-cols-2 gap-2">
      <div>
        <Label className="text-[10px]">{tr("Minimo (vuoto = nessuno)")}</Label>
        <Input value={min} inputMode="decimal" className="h-7 text-xs" aria-label={tr("Minimo di {campo}", { campo: campo.label })}
          onChange={(e) => { setMin(e.target.value); scrivi(e.target.value, max); }} />
      </div>
      <div>
        <Label className="text-[10px]">{tr("Massimo (vuoto = nessuno)")}</Label>
        <Input value={max} inputMode="decimal" className="h-7 text-xs" aria-label={tr("Massimo di {campo}", { campo: campo.label })}
          onChange={(e) => { setMax(e.target.value); scrivi(min, e.target.value); }} />
      </div>
      {esito.errore && <p role="alert" className="col-span-2 text-[11px] text-rose-700">{tr("{errore}: il limite non è salvato.", { errore: esito.errore })}</p>}
    </div>
  );
}

const NESSUNO = "__sempre__";

function MostraSeEditor({ campo, comandanti, onChange }: {
  campo: FieldDefinition;
  comandanti: FieldDefinition[];
  onChange: (r: FieldDefinition["show_if"]) => void;
}) {
  const tr = useT();
  const attuale = leggiMostraSe(campo);
  if (attuale === "complessa") {
    return (
      <p className="col-span-12 text-[11px] text-muted-foreground">
        {tr("Questo campo ha una condizione del modello di serie che qui non si modifica: resta com'è.")}
      </p>
    );
  }
  const comanda = comandanti.find((c) => c.key === attuale?.campo);
  return (
    <div className="col-span-12 space-y-1">
      <Label className="text-[10px]">{tr("Mostra solo se")}</Label>
      <div className="flex flex-wrap gap-2">
        <Select
          value={attuale?.campo ?? NESSUNO}
          onValueChange={(v) => {
            if (v === NESSUNO) return onChange(undefined);
            const c = comandanti.find((x) => x.key === v);
            const op = operatorePer(c);
            onChange(scriviMostraSe({ campo: v, operatore: op, valore: op === "truthy" ? "" : c?.options?.[0]?.value ?? "" }));
          }}
        >
          <SelectTrigger className="h-8 w-48 text-xs" aria-label={tr("Condizione di {campo}", { campo: campo.label })}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NESSUNO}>{tr("Sempre")}</SelectItem>
            {comandanti.map((c) => <SelectItem key={c.key} value={c.key}>{c.label || c.key}</SelectItem>)}
          </SelectContent>
        </Select>
        {attuale && comanda && attuale.operatore !== "truthy" && (
          <>
            <span className="self-center text-xs text-muted-foreground">{attuale.operatore === "contains" ? tr("contiene") : tr("è")}</span>
            <Select value={attuale.valore} onValueChange={(v) => onChange(scriviMostraSe({ ...attuale, valore: v }))}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label={tr("Valore della condizione di {campo}", { campo: campo.label })}><SelectValue /></SelectTrigger>
              <SelectContent>
                {(comanda.options ?? []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        {attuale?.operatore === "truthy" && <span className="self-center text-xs text-muted-foreground">{tr("è attivo")}</span>}
      </div>
      {comandanti.length === 0 && <p className="text-[11px] text-muted-foreground">{tr("Serve prima un campo a scelta o sì/no in questo gruppo.")}</p>}
    </div>
  );
}

const UNITA_RIGA = ["pz", "mq", "ml", "m", "kg", "h", "corpo"];

function RigaPreventivoEditor({ tipo, riga, onChange }: {
  tipo: ElementTypeDefinition;
  riga: EstimateLineMapping | undefined;
  onChange: (r: EstimateLineMapping | undefined) => void;
}) {
  const tr = useT();
  const numerici = campiDelTipoNumerici(tipo);
  const sconosciuti = riga ? segnapostoSconosciuti(riga.description_template, tipo) : [];
  return (
    <div className="space-y-2 rounded-md border border-dashed p-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{tr("Riga nel preventivo")}</Label>
        {riga
          ? <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(undefined)}>{tr("Togli")}</Button>
          : <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange(rigaDiPartenza(tipo))}>{tr("Imposta")}</Button>}
      </div>
      {!riga && <p className="text-[11px] text-muted-foreground">{tr("Senza, nel preventivo dal rilievo la riga ha solo il nome dell'elemento.")}</p>}
      {riga && (
        <>
          <div>
            <Label className="text-[10px]">{tr("Descrizione (i campi tra graffe si riempiono: {esempio})", { esempio: "{larghezza_foro}" })}</Label>
            <Input value={riga.description_template} className="h-8 font-mono text-xs" aria-label={tr("Descrizione nel preventivo di {tipo}", { tipo: tipo.label })}
              onChange={(e) => onChange({ ...riga, description_template: e.target.value })} />
            {sconosciuti.length > 0 && <p className="mt-0.5 text-[11px] text-amber-700">{tr("Non sono campi di questo elemento: {elenco}", { elenco: sconosciuti.map((k) => `{${k}}`).join(", ") })}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">{tr("Unità")}</Label>
              <Select value={riga.unit} onValueChange={(v) => onChange({ ...riga, unit: v })}>
                <SelectTrigger className="h-8 text-xs" aria-label={tr("Unità nel preventivo di {tipo}", { tipo: tipo.label })}><SelectValue /></SelectTrigger>
                <SelectContent>{UNITA_RIGA.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">{tr("Quantità da")}</Label>
              <Select value={riga.quantity_field ?? "quantity"} onValueChange={(v) => onChange({ ...riga, quantity_field: v })}>
                <SelectTrigger className="h-8 text-xs" aria-label={tr("Quantità nel preventivo di {tipo}", { tipo: tipo.label })}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quantity">{tr("Numero di pezzi")}</SelectItem>
                  {numerici.map((f) => <SelectItem key={f.key} value={f.key}>{f.label || f.key}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const campiDelTipoNumerici = (t: ElementTypeDefinition) =>
  (t.sections ?? []).flatMap((s) => s.fields ?? []).filter((f) => f.type === "number" || f.type === "dimension");
