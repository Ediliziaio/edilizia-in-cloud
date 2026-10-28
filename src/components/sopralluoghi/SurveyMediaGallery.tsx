import { useState, type CSSProperties } from "react";
import type { SurveyMediaRow } from "@/types/surveys";
import { surveyMediaIsImage, surveyMediaUrl } from "@/lib/surveys/report";
import { photoPlacementCaption } from "@/lib/surveys/photoPlacement";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Paperclip,
} from "lucide-react";

function Picture({
  url,
  label,
  className,
  style,
}: {
  url: string;
  label: string;
  className: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="flex min-h-24 items-center justify-center gap-2 p-4 text-xs text-orange-900">
      <ImageOff className="h-4 w-4" />
      Immagine non disponibile: aggiorna il rilievo.
    </span>
  ) : (
    <img
      src={url}
      alt={label}
      className={className}
      style={style}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function SurveyMediaGallery({
  media,
  context,
  emptyText = "Nessuna foto o allegato registrato.",
}: {
  media: SurveyMediaRow[];
  context?: (media: SurveyMediaRow) => string;
  emptyText?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [zoom, setZoom] = useState(1);
  const photos = media.filter(
    (m) => surveyMediaIsImage(m) && surveyMediaUrl(m.url),
  );
  const index = photos.findIndex((m) => m.id === selected),
    photo = photos[index];
  const label = (m: SurveyMediaRow) =>
    m.filename ||
    m.checklist_label ||
    (m.type === "audio" ? "Nota vocale" : "Allegato");
  const move = (next: number) => {
    setSelected(photos[next].id);
    setZoom(1);
  };
  return (
    <>
      {!media.length ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {media.map((m) => {
            const url = surveyMediaUrl(m.url);
            return (
              <article
                key={m.id}
                className="min-w-0 overflow-hidden rounded-xl border bg-white"
              >
                {url && surveyMediaIsImage(m) && (
                  <button
                    type="button"
                    className="block w-full bg-slate-50"
                    onClick={() => {
                      setSelected(m.id);
                      setZoom(1);
                    }}
                    aria-label={`Ingrandisci ${label(m)}`}
                  >
                    <Picture
                      key={url}
                      url={url}
                      label={label(m)}
                      className="h-36 w-full object-contain"
                    />
                  </button>
                )}
                <div className="space-y-1.5 p-3">
                  <p className="break-words text-sm font-medium">{label(m)}</p>
                  {photoPlacementCaption(m.annotations).map((line, i) => <p key={i} className="whitespace-pre-wrap break-words text-xs text-slate-600">{line}</p>)}
                  {context && (
                    <p className="text-xs text-slate-500">{context(m)}</p>
                  )}
                  {m.type === "audio" && url && (
                    <audio
                      controls
                      preload="none"
                      src={url}
                      aria-label={label(m)}
                      className="w-full"
                    />
                  )}
                  {m.transcription && (
                    <details className="text-xs text-slate-600">
                      <summary className="cursor-pointer py-1">
                        Leggi trascrizione
                      </summary>
                      <p className="whitespace-pre-wrap py-2">
                        {m.transcription}
                      </p>
                    </details>
                  )}
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-blue-700"
                    >
                      <Paperclip className="h-3 w-3" />
                      {m.type === "annotated_photo" ? "Apri proposta" : "Apri originale"}
                    </a>
                  ) : (
                    <p role="status" className="text-xs text-orange-800">
                      File non disponibile. Aggiorna il sopralluogo per
                      rinnovare l’accesso.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {photo && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent className="flex h-[88dvh] max-h-[88dvh] w-[96vw] max-w-5xl flex-col overflow-hidden rounded-2xl p-4">
            <DialogHeader className="pr-10">
              <DialogTitle>{label(photo)}</DialogTitle>
              <DialogDescription>
                {context?.(photo) || "Foto del sopralluogo"} · {index + 1} di{" "}
                {photos.length}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-slate-100">
              <div
                style={{ width: `${zoom * 100}%`, minHeight: "100%" }}
                className="grid place-items-center"
              >
                <Picture
                  key={photo.url}
                  url={surveyMediaUrl(photo.url)!}
                  label={label(photo)}
                  className="w-full object-contain"
                  style={{ maxHeight: `calc(65dvh * ${zoom})` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Foto precedente"
                  disabled={index === 0}
                  onClick={() => move(index - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Foto successiva"
                  disabled={index === photos.length - 1}
                  onClick={() => move(index + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Riduci foto"
                  disabled={zoom <= 1}
                  onClick={() => setZoom(Math.max(1, zoom - 0.5))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Ingrandisci foto"
                  disabled={zoom >= 3}
                  onClick={() => setZoom(Math.min(3, zoom + 0.5))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
              <a
                href={surveyMediaUrl(photo.url)!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-700"
              >
                <ExternalLink className="h-4 w-4" />
                {photo.type === "annotated_photo" ? "Apri proposta" : "Apri originale"}
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
