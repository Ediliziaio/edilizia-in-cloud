/**
 * ElementCard — UN elemento (es. UN infisso) con sezioni campi + foto + audio
 */
import { useMemo } from "react";
import type {
  ElementTypeDefinition,
  SurveyElementRow,
  SurveyMediaRow,
} from "@/types/surveys";
import { isVisible } from "./evalConditions";
import { PhotoChecklist } from "./PhotoChecklist";
import { FreePhotoUpload } from "./FreePhotoUpload";
import { AudioRecorder } from "./AudioRecorder";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { portoncinoOpeningComplete } from "@/lib/surveys/windowSurvey";

export interface ElementCardProps {
  element: SurveyElementRow;
  elementType: ElementTypeDefinition;
  index: number;
  surveyId: string;
  media: SurveyMediaRow[];
  onOpen: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onMediaAdded?: (m: SurveyMediaRow) => void;
  onMediaDeleted?: (id: string) => void;
}

export function ElementCard({
  element,
  elementType,
  index,
  surveyId,
  media,
  onOpen,
  onDuplicate,
  onDelete,
  onMediaAdded,
  onMediaDeleted,
}: ElementCardProps) {
  const elementMedia = media.filter((m) => m.element_id === element.id);
  const audioMedia = elementMedia.find((m) => m.type === "audio") ?? null;

  // Obbligatori solo fra ciò che è DAVVERO a schermo: una sezione nascosta da
  // `show_if` (p.es. "Tapparella" su una finestra senza tapparella) non deve
  // pretendere i suoi campi. Contandoli tutti, un infisso semplice risultava
  // incompleto per 12 campi che l'operatore non poteva nemmeno vedere.
  const requiredFields = useMemo(() => {
    const valori = element.values ?? {};
    const out: string[] = [];
    elementType.sections.forEach((s) => {
      if (!isVisible(s.show_if, valori)) return;
      s.fields.forEach((f) => {
        if (f.required && isVisible(f.show_if, valori)) out.push(f.key);
      });
    });
    return out;
  }, [elementType, element.values]);

  const missingFields = useMemo(() => {
    return requiredFields.filter((k) => {
      if (
        elementType.key === "portoncino_blindato" &&
        k === "apertura" &&
        portoncinoOpeningComplete(element.values)
      )
        return false;
      const v = element.values?.[k];
      return v == null || v === "" || (Array.isArray(v) && v.length === 0);
    });
  }, [element.values, elementType.key, requiredFields]);

  const missingPhotos = useMemo(() => {
    return (elementType.required_photos ?? [])
      .filter((p) => p.required)
      .filter(
        (p) =>
          !elementMedia.some(
            (m) => m.checklist_key === p.key && m.type === "photo",
          ),
      );
  }, [elementType, elementMedia]);

  const isComplete = missingFields.length === 0 && missingPhotos.length === 0;

  return (
    <Card
      className={cn(
        "border-2",
        isComplete ? "border-emerald-200 bg-emerald-50/20" : "border-amber-200",
      )}
    >
      <CardHeader className="p-3 pb-2 flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            #{index + 1}
          </Badge>
          <p className="font-semibold text-sm">{elementType.label}</p>
          {isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          )}
        </div>
        <div className="flex gap-1">
          {onDuplicate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDuplicate}
              className="h-7 w-7"
              title="Duplica"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="h-7 w-7 text-rose-600"
              title="Elimina"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-3">
        {(missingFields.length > 0 || missingPhotos.length > 0) && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
            {missingFields.length > 0 && (
              <p>
                Mancano {missingFields.length}{" "}
                {missingFields.length === 1 ? "campo" : "campi"} obbligatori
              </p>
            )}
            {missingPhotos.length > 0 && (
              <p>
                Mancano {missingPhotos.length}{" "}
                {missingPhotos.length === 1
                  ? "foto richiesta"
                  : "foto richieste"}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {element.element_label || elementType.label} · Quantità{" "}
              {element.quantity}
            </p>
            <p className="text-xs text-slate-500">
              Scheda visuale con misure, aperture e dettagli. Salvataggio
              esplicito.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onOpen}
            className="min-h-11 gap-2 rounded-xl"
          >
            <Pencil className="h-4 w-4" />
            Apri scheda elemento
          </Button>
        </div>

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
