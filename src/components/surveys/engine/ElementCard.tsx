/**
 * ElementCard — UN elemento (es. UN infisso) con sezioni campi + foto + audio
 */
import { useMemo } from "react";
import type { ElementTypeDefinition, SurveyElementRow, SurveyMediaRow } from "@/types/surveys";
import { SectionRenderer } from "./SectionRenderer";
import { PhotoChecklist } from "./PhotoChecklist";
import { FreePhotoUpload } from "./FreePhotoUpload";
import { AudioRecorder } from "./AudioRecorder";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ElementCardProps {
  element: SurveyElementRow;
  elementType: ElementTypeDefinition;
  index: number;
  surveyId: string;
  media: SurveyMediaRow[];
  onChange: (id: string, patch: Partial<SurveyElementRow>) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onMediaAdded?: (m: SurveyMediaRow) => void;
  onMediaDeleted?: (id: string) => void;
}

export function ElementCard({
  element, elementType, index, surveyId, media, onChange, onDuplicate, onDelete,
  onMediaAdded, onMediaDeleted,
}: ElementCardProps) {
  const elementMedia = media.filter((m) => m.element_id === element.id);
  const audioMedia = elementMedia.find((m) => m.type === "audio") ?? null;

  const requiredFields = useMemo(() => {
    const out: string[] = [];
    elementType.sections.forEach((s) => {
      s.fields.forEach((f) => {
        if (f.required) out.push(f.key);
      });
    });
    return out;
  }, [elementType]);

  const missingFields = useMemo(() => {
    return requiredFields.filter((k) => {
      const v = element.values?.[k];
      return v == null || v === "" || (Array.isArray(v) && v.length === 0);
    });
  }, [element.values, requiredFields]);

  const missingPhotos = useMemo(() => {
    return (elementType.required_photos ?? [])
      .filter((p) => p.required)
      .filter((p) => !elementMedia.some((m) => m.checklist_key === p.key && m.type === "photo"));
  }, [elementType, elementMedia]);

  const isComplete = missingFields.length === 0 && missingPhotos.length === 0;

  return (
    <Card className={cn(
      "border-2",
      isComplete ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200",
    )}>
      <CardHeader className="p-3 pb-2 flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">#{index + 1}</Badge>
          <p className="font-semibold text-sm">{elementType.label}</p>
          {isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          )}
        </div>
        <div className="flex gap-1">
          {onDuplicate && (
            <Button variant="ghost" size="icon" onClick={onDuplicate} className="h-7 w-7" title="Duplica">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon" onClick={onDelete} className="h-7 w-7 text-rose-600" title="Elimina">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-3">
        {(missingFields.length > 0 || missingPhotos.length > 0) && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
            {missingFields.length > 0 && (
              <p>Mancano {missingFields.length} {missingFields.length === 1 ? "campo" : "campi"} obbligatori</p>
            )}
            {missingPhotos.length > 0 && (
              <p>Mancano {missingPhotos.length} {missingPhotos.length === 1 ? "foto richiesta" : "foto richieste"}</p>
            )}
          </div>
        )}

        {elementType.allow_quantity !== false && (
          <div>
            <Label className="text-xs">Quantità</Label>
            <Input
              type="number"
              min={1}
              value={element.quantity}
              onChange={(e) => onChange(element.id, { quantity: parseInt(e.target.value) || 1 })}
              className="h-9 w-24"
            />
          </div>
        )}

        {elementType.sections.map((section) => (
          <SectionRenderer
            key={section.key}
            section={section}
            values={element.values ?? {}}
            onChange={(k, v) => onChange(element.id, {
              values: { ...(element.values ?? {}), [k]: v },
            })}
          />
        ))}

        {(elementType.required_photos?.length ?? 0) > 0 && (
          <PhotoChecklist
            items={elementType.required_photos}
            surveyId={surveyId}
            elementId={element.id}
            media={elementMedia}
            onMediaAdded={onMediaAdded}
            onMediaDeleted={onMediaDeleted}
          />
        )}

        <FreePhotoUpload
          surveyId={surveyId}
          elementId={element.id}
          media={elementMedia}
          onMediaAdded={onMediaAdded}
          onMediaDeleted={onMediaDeleted}
          label="Altre foto"
        />

        <AudioRecorder
          surveyId={surveyId}
          elementId={element.id}
          existingAudio={audioMedia}
          onAudioAdded={onMediaAdded}
          onAudioDeleted={onMediaDeleted}
          autoTranscribe
        />
      </CardContent>
    </Card>
  );
}
