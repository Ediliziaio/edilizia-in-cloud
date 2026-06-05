/**
 * AreaCard — UN'area (stanza/falda/facciata) con campi area + lista elementi
 */
import { useState } from "react";
import type {
  AreaDefinition, ElementTypeDefinition, SurveyAreaRow, SurveyElementRow,
  SurveyMediaRow,
} from "@/types/surveys";
import { SectionRenderer } from "./SectionRenderer";
import { PhotoChecklist } from "./PhotoChecklist";
import { FreePhotoUpload } from "./FreePhotoUpload";
import { ElementCard } from "./ElementCard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MapPin, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AreaCardProps {
  area: SurveyAreaRow;
  areaDefinition: AreaDefinition;
  elementTypes: ElementTypeDefinition[];
  elements: SurveyElementRow[];
  media: SurveyMediaRow[];
  surveyId: string;
  onAreaChange: (id: string, patch: Partial<SurveyAreaRow>) => void;
  onAreaDelete: () => void;
  onElementAdd: (elementType: string) => void;
  onElementChange: (id: string, patch: Partial<SurveyElementRow>) => void;
  onElementDuplicate: (id: string) => void;
  onElementDelete: (id: string) => void;
  onMediaAdded?: (m: SurveyMediaRow) => void;
  onMediaDeleted?: (id: string) => void;
}

export function AreaCard({
  area, areaDefinition, elementTypes, elements, media, surveyId,
  onAreaChange, onAreaDelete, onElementAdd, onElementChange,
  onElementDuplicate, onElementDelete, onMediaAdded, onMediaDeleted,
}: AreaCardProps) {
  const [expanded, setExpanded] = useState(true);
  const areaMedia = media.filter((m) => m.area_id === area.id && !m.element_id);
  const elementCount = elements.length;

  // Costruisci una FieldSection sintetica dai fields dell'area
  const areaSection = {
    key: "area_fields",
    label: "Dati area",
    fields: areaDefinition.fields,
    collapsible: false,
    default_open: true,
  };

  return (
    <Card className="border-2 border-orange-200 overflow-hidden">
      <CardHeader className="p-3 bg-orange-50/40 flex-row items-center gap-2 space-y-0">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <MapPin className="h-4 w-4 text-orange-600 shrink-0" />
          <Input
            value={area.name}
            onChange={(e) => onAreaChange(area.id, { name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Nome area (es. Soggiorno, Falda Sud)"
            className="h-8 font-semibold flex-1 min-w-0"
            list={`area-suggestions-${area.id}`}
          />
          <datalist id={`area-suggestions-${area.id}`}>
            {(areaDefinition.name_suggestions ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </button>
        <span className="text-xs text-muted-foreground shrink-0">
          {elementCount} {elementCount === 1 ? "elemento" : "elementi"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onAreaDelete}
          className="h-7 w-7 text-rose-600"
          title="Elimina area"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      {expanded && (
        <CardContent className="p-3 space-y-3">
          {areaDefinition.fields.length > 0 && (
            <SectionRenderer
              section={areaSection}
              values={area.area_data ?? {}}
              onChange={(k, v) => onAreaChange(area.id, {
                area_data: { ...(area.area_data ?? {}), [k]: v },
              })}
            />
          )}

          {(areaDefinition.required_photos?.length ?? 0) > 0 && (
            <PhotoChecklist
              items={areaDefinition.required_photos!}
              surveyId={surveyId}
              areaId={area.id}
              media={areaMedia}
              onMediaAdded={onMediaAdded}
              onMediaDeleted={onMediaDeleted}
            />
          )}

          <FreePhotoUpload
            surveyId={surveyId}
            areaId={area.id}
            media={areaMedia}
            onMediaAdded={onMediaAdded}
            onMediaDeleted={onMediaDeleted}
            label="Altre foto area"
          />

          {/* Lista elementi */}
          {elements.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Elementi rilevati
              </p>
              {elements
                .sort((a, b) => a.position - b.position)
                .map((el, idx) => {
                  const type = elementTypes.find((t) => t.key === el.element_type);
                  if (!type) return null;
                  return (
                    <ElementCard
                      key={el.id}
                      element={el}
                      elementType={type}
                      index={idx}
                      surveyId={surveyId}
                      media={media}
                      onChange={onElementChange}
                      onDuplicate={() => onElementDuplicate(el.id)}
                      onDelete={() => onElementDelete(el.id)}
                      onMediaAdded={onMediaAdded}
                      onMediaDeleted={onMediaDeleted}
                    />
                  );
                })}
            </div>
          )}

          {/* Add element dropdown */}
          {elementTypes.length === 1 ? (
            <Button
              variant="outline"
              onClick={() => onElementAdd(elementTypes[0].key)}
              className={cn("w-full gap-2 border-dashed border-2", "border-orange-300 hover:bg-orange-50")}
            >
              <Plus className="h-4 w-4" />
              Aggiungi {elementTypes[0].label}
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
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {elementTypes.map((t) => (
                  <DropdownMenuItem key={t.key} onClick={() => onElementAdd(t.key)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      )}
    </Card>
  );
}
