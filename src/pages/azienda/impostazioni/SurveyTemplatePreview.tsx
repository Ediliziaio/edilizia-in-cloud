/**
 * SurveyTemplatePreview — anteprima interattiva del template
 *
 * Renderizza il template usando lo stesso engine che il tecnico vedrà
 * sul cantiere, ma:
 *   - Senza salvare niente in DB (state solo locale)
 *   - Senza upload foto/audio (componenti mock con icona placeholder)
 *   - Con 1 area di esempio pre-popolata
 *   - Con possibilità di aggiungere/togliere elementi per ogni element_type
 *   - Show_if conditional FUNZIONANTI così l'utente può testare la logica
 *     (es. spunto "Tapparella" e vedo apparire la sezione)
 *
 * Bottoni di test in alto: "Mostra valori state" (debug JSON), Reset.
 */
import { useMemo, useState } from "react";
import type {
  TemplateSchema, FieldSection, ElementTypeDefinition, PhotoChecklistItem,
  SurveyTemplateRow,
} from "@/types/surveys";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye, Code, RotateCcw, ChevronDown, ChevronRight,
  Camera, Mic, X, Plus, Sparkles, MapPin, Trash2, FileSignature,
} from "lucide-react";
import { SectionRenderer } from "@/components/surveys/engine/SectionRenderer";
import { cn } from "@/lib/utils";

interface PreviewElement {
  id: string;
  type: string;
  values: Record<string, unknown>;
  quantity: number;
}

interface PreviewArea {
  id: string;
  name: string;
  area_data: Record<string, unknown>;
  elements: PreviewElement[];
}

interface SurveyTemplatePreviewProps {
  template: SurveyTemplateRow;
  onClose: () => void;
}

export function SurveyTemplatePreview({ template, onClose }: SurveyTemplatePreviewProps) {
  const schema = template.schema as TemplateSchema;
  const [headerData, setHeaderData] = useState<Record<string, unknown>>({});
  const [areas, setAreas] = useState<PreviewArea[]>([
    {
      id: "preview-area-1",
      name: schema?.area_definition?.name_suggestions?.[0] ?? `${template.area_label} di esempio`,
      area_data: {},
      elements: [],
    },
  ]);
  const [showState, setShowState] = useState(false);

  const reset = () => {
    setHeaderData({});
    setAreas([{
      id: "preview-area-1",
      name: schema?.area_definition?.name_suggestions?.[0] ?? `${template.area_label} di esempio`,
      area_data: {},
      elements: [],
    }]);
  };

  const updateHeader = (key: string, value: unknown) => {
    setHeaderData((prev) => ({ ...prev, [key]: value }));
  };

  const updateAreaData = (areaId: string, key: string, value: unknown) => {
    setAreas((prev) => prev.map((a) =>
      a.id === areaId ? { ...a, area_data: { ...a.area_data, [key]: value } } : a,
    ));
  };

  const addElement = (areaId: string, elementType: string) => {
    setAreas((prev) => prev.map((a) =>
      a.id === areaId ? {
        ...a,
        elements: [...a.elements, {
          id: `preview-el-${Date.now()}`,
          type: elementType,
          values: {},
          quantity: 1,
        }],
      } : a,
    ));
  };

  const updateElementValue = (areaId: string, elementId: string, key: string, value: unknown) => {
    setAreas((prev) => prev.map((a) =>
      a.id === areaId ? {
        ...a,
        elements: a.elements.map((e) =>
          e.id === elementId ? { ...e, values: { ...e.values, [key]: value } } : e,
        ),
      } : a,
    ));
  };

  const removeElement = (areaId: string, elementId: string) => {
    setAreas((prev) => prev.map((a) =>
      a.id === areaId ? { ...a, elements: a.elements.filter((e) => e.id !== elementId) } : a,
    ));
  };

  const addArea = () => {
    const idx = areas.length + 1;
    const suggestion = schema?.area_definition?.name_suggestions?.[idx - 1];
    setAreas((prev) => [...prev, {
      id: `preview-area-${Date.now()}`,
      name: suggestion ?? `${template.area_label} ${idx}`,
      area_data: {},
      elements: [],
    }]);
  };

  const elementTypeByKey = useMemo(() => {
    const map = new Map<string, ElementTypeDefinition>();
    (schema?.element_types ?? []).forEach((et) => map.set(et.key, et));
    return map;
  }, [schema]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-orange-600" />
              <DialogTitle className="text-base">Anteprima — {template.name}</DialogTitle>
              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                Modalità test (no salvataggio)
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setShowState((v) => !v)} className="gap-1.5">
                <Code className="h-3.5 w-3.5" />
                {showState ? "Nascondi state" : "Mostra state"}
              </Button>
              <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Compila i campi per testare il rendering, validation, show_if condizionali.
            Le foto e audio sono disabilitati in anteprima.
          </p>
        </DialogHeader>

        <Tabs defaultValue="form" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-3 shrink-0">
            <TabsTrigger value="form" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Form (come lo vede il tecnico)</TabsTrigger>
            <TabsTrigger value="summary" className="gap-1.5"><FileSignature className="h-3.5 w-3.5" /> Riepilogo struttura</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">

              <TabsContent value="form" className="mt-0 space-y-4">
                {/* Header sections */}
                {(schema?.header_schema?.length ?? 0) > 0 && (
                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2">
                      Header sopralluogo ({schema.header_schema.length} sezioni)
                    </h3>
                    <div className="space-y-2">
                      {schema.header_schema.map((sec) => (
                        <SectionRenderer
                          key={sec.key}
                          section={sec}
                          values={headerData}
                          onChange={(k, v) => updateHeader(k, v)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Aree */}
                <section>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" />
                    {template.area_label_plural} ({areas.length})
                  </h3>
                  <div className="space-y-3">
                    {areas.map((area) => (
                      <PreviewAreaCard
                        key={area.id}
                        area={area}
                        template={template}
                        schema={schema}
                        elementTypeByKey={elementTypeByKey}
                        onUpdateData={(k, v) => updateAreaData(area.id, k, v)}
                        onAddElement={(t) => addElement(area.id, t)}
                        onUpdateElement={(eid, k, v) => updateElementValue(area.id, eid, k, v)}
                        onRemoveElement={(eid) => removeElement(area.id, eid)}
                      />
                    ))}
                    <Button
                      variant="outline"
                      onClick={addArea}
                      className="w-full gap-2 border-dashed border-2 border-orange-300 hover:bg-orange-50"
                    >
                      <Plus className="h-4 w-4" />
                      Aggiungi {template.area_label.toLowerCase()}
                    </Button>
                  </div>
                </section>

                {/* Foto generali (mock) */}
                {(schema?.general_required_photos?.length ?? 0) > 0 && (
                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-orange-700 mb-2 flex items-center gap-2">
                      <Camera className="h-3.5 w-3.5" />
                      Foto generali ({schema.general_required_photos.length})
                    </h3>
                    <MockPhotoChecklist photos={schema.general_required_photos} />
                  </section>
                )}
              </TabsContent>

              <TabsContent value="summary" className="mt-0 space-y-4 text-sm">
                <SummaryStats template={template} schema={schema} />
              </TabsContent>

              {/* State debug pane */}
              {showState && (
                <Card className="border-violet-200 bg-violet-50/40">
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-violet-700">
                      <Code className="h-3 w-3" />
                      State JSON corrente
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <pre className="text-[10px] bg-white rounded p-2 overflow-x-auto font-mono">
                      {JSON.stringify({ header_data: headerData, areas }, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Chiudi anteprima</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function PreviewAreaCard({
  area, template, schema, elementTypeByKey,
  onUpdateData, onAddElement, onUpdateElement, onRemoveElement,
}: {
  area: PreviewArea;
  template: SurveyTemplateRow;
  schema: TemplateSchema;
  elementTypeByKey: Map<string, ElementTypeDefinition>;
  onUpdateData: (k: string, v: unknown) => void;
  onAddElement: (elementType: string) => void;
  onUpdateElement: (elementId: string, k: string, v: unknown) => void;
  onRemoveElement: (elementId: string) => void;
}) {
  const areaFields = schema?.area_definition?.fields ?? [];

  return (
    <Card className="border-2 border-orange-200 overflow-hidden">
      <CardHeader className="p-3 bg-orange-50/40 flex-row items-center gap-2 space-y-0">
        <MapPin className="h-4 w-4 text-orange-600 shrink-0" />
        <span className="font-semibold text-sm flex-1">{area.name}</span>
        <Badge variant="outline" className="text-[10px]">
          {area.elements.length} {area.elements.length === 1 ? "elemento" : "elementi"}
        </Badge>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {areaFields.length > 0 && (
          <SectionRenderer
            section={{
              key: "area_fields",
              label: "Dati area",
              fields: areaFields,
              collapsible: false,
              default_open: true,
            }}
            values={area.area_data}
            onChange={onUpdateData}
          />
        )}

        {schema?.area_definition?.required_photos && schema.area_definition.required_photos.length > 0 && (
          <MockPhotoChecklist photos={schema.area_definition.required_photos} />
        )}

        {area.elements.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Elementi rilevati ({area.elements.length})
            </p>
            {area.elements.map((el, idx) => {
              const type = elementTypeByKey.get(el.type);
              if (!type) return null;
              return (
                <PreviewElementCard
                  key={el.id}
                  element={el}
                  elementType={type}
                  index={idx}
                  onUpdate={(k, v) => onUpdateElement(el.id, k, v)}
                  onRemove={() => onRemoveElement(el.id)}
                />
              );
            })}
          </div>
        )}

        {/* Add element */}
        {(schema?.element_types?.length ?? 0) === 1 ? (
          <Button
            variant="outline"
            onClick={() => onAddElement(schema.element_types[0].key)}
            className="w-full gap-2 border-dashed border-2 border-orange-300 hover:bg-orange-50"
          >
            <Plus className="h-4 w-4" />
            Aggiungi {schema.element_types[0].label}
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full gap-2 border-dashed border-2 border-orange-300 hover:bg-orange-50"
              >
                <Plus className="h-4 w-4" />
                Aggiungi elemento
                <ChevronDown className="h-3 w-3 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
              {(schema?.element_types ?? []).map((et) => (
                <DropdownMenuItem
                  key={et.key}
                  onClick={() => onAddElement(et.key)}
                  className="flex-col items-start gap-0.5 py-2"
                >
                  <span className="font-medium text-sm">{et.label}</span>
                  {et.description && (
                    <span className="text-[10px] text-muted-foreground line-clamp-2">{et.description}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewElementCard({
  element, elementType, index, onUpdate, onRemove,
}: {
  element: PreviewElement;
  elementType: ElementTypeDefinition;
  index: number;
  onUpdate: (k: string, v: unknown) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="border-2 border-amber-200">
      <CardHeader className="p-3 pb-2 flex-row items-center gap-2 space-y-0">
        <Badge variant="outline" className="font-mono text-[10px]">#{index + 1}</Badge>
        <p className="font-semibold text-sm flex-1">{elementType.label}</p>
        <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7 text-rose-600">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {elementType.sections.map((section) => (
          <SectionRenderer
            key={section.key}
            section={section}
            values={element.values}
            onChange={onUpdate}
          />
        ))}
        {(elementType.required_photos?.length ?? 0) > 0 && (
          <MockPhotoChecklist photos={elementType.required_photos!} />
        )}
        <div className="rounded-lg border bg-muted/10 p-2 flex items-center gap-2 text-xs">
          <Mic className="h-3.5 w-3.5 text-violet-600" />
          <span className="text-muted-foreground">Audio note (disabilitato in anteprima)</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MockPhotoChecklist({ photos }: { photos: PhotoChecklistItem[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Camera className="h-3 w-3" />
        Foto richieste ({photos.length})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((item) => (
          <div
            key={item.key}
            className={cn(
              "rounded-lg border-2 border-dashed p-3 text-center flex flex-col items-center gap-1",
              item.required ? "border-rose-300 bg-rose-50/30" : "border-muted-foreground/30 bg-muted/10",
            )}
          >
            <Camera className={cn("h-6 w-6", item.required ? "text-rose-500" : "text-muted-foreground")} />
            <p className="text-[10px] font-medium leading-tight">
              {item.label} {item.required && <span className="text-rose-500">*</span>}
            </p>
            {item.hint && (
              <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">{item.hint}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryStats({ template, schema }: { template: SurveyTemplateRow; schema: TemplateSchema }) {
  const headerSectionsCount = schema?.header_schema?.length ?? 0;
  const headerFieldsCount = (schema?.header_schema ?? []).reduce((s, sec) => s + (sec.fields?.length ?? 0), 0);
  const headerRequired = (schema?.header_schema ?? []).reduce(
    (s, sec) => s + (sec.fields ?? []).filter((f) => f.required).length, 0,
  );
  const areaFieldsCount = schema?.area_definition?.fields?.length ?? 0;
  const areaPhotosCount = schema?.area_definition?.required_photos?.length ?? 0;
  const elementTypesCount = schema?.element_types?.length ?? 0;
  const totalElementFields = (schema?.element_types ?? []).reduce(
    (s, et) => s + (et.sections ?? []).reduce((s2, sec) => s2 + (sec.fields?.length ?? 0), 0), 0,
  );
  const totalElementPhotos = (schema?.element_types ?? []).reduce(
    (s, et) => s + (et.required_photos?.length ?? 0), 0,
  );
  const genPhotosCount = schema?.general_required_photos?.length ?? 0;
  const totalPhotos = areaPhotosCount + totalElementPhotos + genPhotosCount;
  const conditionalSections = (schema?.element_types ?? []).reduce(
    (s, et) => s + (et.sections ?? []).filter((sec) => sec.show_if).length, 0,
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <StatCard label="Sezioni header" value={headerSectionsCount} sub={`${headerFieldsCount} campi, ${headerRequired} obbligatori`} />
        <StatCard label="Campi area" value={areaFieldsCount} sub={`${areaPhotosCount} foto richieste`} />
        <StatCard label="Tipologie elementi" value={elementTypesCount} sub={`${totalElementFields} campi totali`} />
        <StatCard label="Totale foto" value={totalPhotos} sub={`${genPhotosCount} gen · ${areaPhotosCount} area · ${totalElementPhotos} per elem.`} />
        <StatCard label="Sezioni condizionali" value={conditionalSections} sub="con show_if attivo" highlight={conditionalSections > 0} />
        <StatCard label="Versione" value={template.version} sub={template.is_system ? "Sistema" : "Personalizzato"} />
      </div>

      <Card>
        <CardHeader className="p-3 pb-2">
          <div className="text-xs font-bold uppercase tracking-wide text-orange-700">Elementi disponibili</div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-1.5">
          {(schema?.element_types ?? []).map((et) => (
            <div key={et.key} className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[10px] font-mono">{et.key}</Badge>
              <span className="font-medium">{et.label}</span>
              <span className="text-muted-foreground ml-auto">
                {et.sections?.length ?? 0} sezioni · {(et.sections ?? []).filter((s) => s.show_if).length} cond.
                · {et.required_photos?.length ?? 0} foto
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label, value, sub, highlight,
}: { label: string; value: number; sub: string; highlight?: boolean }) {
  return (
    <Card className={cn(highlight && "border-violet-300 bg-violet-50/30")}>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold", highlight && "text-violet-700")}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
