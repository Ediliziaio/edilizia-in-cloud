/**
 * PhotoChecklist — riquadri "scatta foto" + thumbnail per ogni voce
 *
 * Per ogni checklist item:
 * - Se nessuna foto: riquadro tratteggiato con icona camera + label
 *   click apre file picker con capture="environment" (apre camera diretta su mobile)
 * - Se foto presente: thumbnail + bottone elimina; se multiple permesso, "+" per aggiungere
 *
 * Required marcati con "*" — UI mostra warning se mancano.
 */
import { useState, useRef } from "react";
import type { PhotoChecklistItem, SurveyMediaRow } from "@/types/surveys";
import { Camera, Trash2, AlertCircle, Loader2, Plus, ImageIcon } from "lucide-react";
import { uploadMedia, deleteMedia } from "@/lib/api/surveys";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PhotoChecklistProps {
  items: PhotoChecklistItem[];
  surveyId: string;
  areaId?: string | null;
  elementId?: string | null;
  /** Solo media già caricati per questo scope (filtrali tu) */
  media: SurveyMediaRow[];
  onMediaAdded?: (media: SurveyMediaRow) => void;
  onMediaDeleted?: (mediaId: string) => void;
}

export function PhotoChecklist({
  items, surveyId, areaId, elementId, media, onMediaAdded, onMediaDeleted,
}: PhotoChecklistProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const photosByKey = items.reduce((acc, item) => {
    acc[item.key] = media.filter(
      (m) => m.type === "photo" && m.checklist_key === item.key,
    );
    return acc;
  }, {} as Record<string, SurveyMediaRow[]>);

  const handleUpload = async (item: PhotoChecklistItem, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(item.key);
    try {
      for (let i = 0; i < files.length; i++) {
        const m = await uploadMedia(surveyId, files[i], {
          type: "photo",
          areaId: areaId ?? null,
          elementId: elementId ?? null,
          checklistKey: item.key,
          checklistLabel: item.label,
        });
        onMediaAdded?.(m);
      }
    } catch (e) {
      toast.error("Upload foto fallito", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (mediaId: string) => {
    try {
      await deleteMedia(mediaId);
      onMediaDeleted?.(mediaId);
    } catch (e) {
      toast.error("Eliminazione fallita", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Camera className="h-3 w-3" />
        Foto richieste
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item) => {
          const photos = photosByKey[item.key] ?? [];
          const hasPhoto = photos.length > 0;
          const isMissing = item.required && !hasPhoto;
          const allowMore = item.multiple || !hasPhoto;
          const isUploading = uploading === item.key;

          return (
            <div
              key={item.key}
              className={cn(
                "rounded-lg border-2 overflow-hidden",
                hasPhoto ? "border-emerald-300 bg-emerald-50/30" :
                isMissing ? "border-rose-300 bg-rose-50/30" : "border-dashed border-muted-foreground/30",
              )}
            >
              {!hasPhoto ? (
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[item.key]?.click()}
                  disabled={isUploading}
                  className="w-full p-3 text-center hover:bg-muted/30 transition-colors flex flex-col items-center gap-1.5"
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  ) : (
                    <Camera className={cn("h-6 w-6", isMissing ? "text-rose-500" : "text-muted-foreground")} />
                  )}
                  <p className={cn("text-[10px] font-medium leading-tight", isMissing && "text-rose-700")}>
                    {item.label} {item.required && <span>*</span>}
                  </p>
                  {item.hint && (
                    <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2">{item.hint}</p>
                  )}
                  {isMissing && (
                    <p className="text-[9px] text-rose-600 flex items-center gap-0.5">
                      <AlertCircle className="h-2.5 w-2.5" />
                      Richiesta
                    </p>
                  )}
                </button>
              ) : (
                <div className="space-y-1 p-1">
                  <p className="text-[10px] font-medium px-1 line-clamp-1 flex items-center gap-1">
                    <ImageIcon className="h-2.5 w-2.5 text-emerald-600" />
                    {item.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {photos.map((p) => (
                      <div key={p.id} className="relative group aspect-square">
                        {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                        <img
                          src={p.url}
                          alt={p.checklist_label ?? "Foto"}
                          className="w-full h-full object-cover rounded"
                        />
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="absolute top-0.5 right-0.5 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Elimina"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    {allowMore && (
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[item.key]?.click()}
                        disabled={isUploading}
                        className="aspect-square border-2 border-dashed rounded flex items-center justify-center hover:bg-muted/30"
                      >
                        {isUploading
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Plus className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <input
                ref={(el) => { fileInputRefs.current[item.key] = el; }}
                type="file"
                accept="image/*"
                capture="environment"
                multiple={item.multiple}
                className="hidden"
                onChange={(e) => {
                  handleUpload(item, e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
