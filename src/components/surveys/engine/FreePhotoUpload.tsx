/**
 * FreePhotoUpload — upload di foto LIBERE (non legate a una checklist del template).
 *
 * Pensato per il cantiere/mobile: due ingressi separati perché su mobile
 * l'attributo `capture="environment"` forza la fotocamera e impedisce di
 * scegliere dalla galleria. Quindi due bottoni:
 *   - "Scatta foto" → fotocamera diretta (capture)
 *   - "Galleria"    → file/immagini già esistenti (multipla)
 *
 * Le foto sono salvate con type='photo' e checklist_key=null, con scope
 * opzionale area/elemento (così confluiscono nel report nel punto giusto).
 */
import { useState, useRef } from "react";
import type { SurveyMediaRow } from "@/types/surveys";
import { Camera, Images, Trash2, Loader2, ImageIcon } from "lucide-react";
import { uploadMedia, deleteMedia, validateSurveyPhoto } from "@/lib/api/surveys";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

export interface FreePhotoUploadProps {
  surveyId: string;
  areaId?: string | null;
  elementId?: string | null;
  /** Media dello scope corrente — il componente filtra le foto libere (type photo && !checklist_key). */
  media: SurveyMediaRow[];
  onMediaAdded?: (m: SurveyMediaRow) => void;
  onMediaDeleted?: (id: string) => void;
  label?: string;
}

export function FreePhotoUpload({
  surveyId, areaId, elementId, media, onMediaAdded, onMediaDeleted,
  label = "Foto libere",
}: FreePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const confirm = useConfirm();

  const photos = media.filter((m) => m.type === "photo" && !m.checklist_key);

  const handleFiles = async (files: FileList | null) => {
    // Snapshot immediato: la FileList è "live" e viene azzerata da value="".
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        const invalid = validateSurveyPhoto(file);
        if (invalid) { toast.error("File non valido", { description: invalid }); continue; }
        const m = await uploadMedia(surveyId, file, {
          type: "photo",
          areaId: areaId ?? null,
          elementId: elementId ?? null,
          checklistKey: null,
          checklistLabel: null,
        });
        onMediaAdded?.(m);
      }
    } catch (e) {
      toast.error("Upload foto fallito", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({
      title: "Eliminare la foto?",
      description: "La foto verrà rimossa definitivamente dal sopralluogo.",
      confirmLabel: "Elimina",
      variant: "destructive",
    }))) return;
    try {
      await deleteMedia(id);
      onMediaDeleted?.(id);
    } catch (e) {
      toast.error("Eliminazione fallita", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <ImageIcon className="h-3 w-3" />
        {label}{photos.length > 0 ? ` · ${photos.length}` : ""}
      </p>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square">
              <img
                loading="lazy"
                src={p.url}
                alt={p.filename ?? "Foto"}
                className="w-full h-full object-cover rounded-lg border"
              />
              {/* Delete sempre visibile (su touch non c'è hover) */}
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="absolute top-1 right-1 bg-black/60 hover:bg-rose-600 text-white rounded-full p-1.5"
                title="Elimina"
                aria-label="Elimina foto"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="h-11 gap-2 border-dashed"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Scatta foto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => galleryRef.current?.click()}
          disabled={uploading}
          className="h-11 gap-2 border-dashed"
        >
          <Images className="h-4 w-4" />
          Galleria
        </Button>
      </div>

      {/* Fotocamera diretta (mobile) — un singolo scatto */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />
      {/* Galleria / file esistenti — selezione multipla */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
