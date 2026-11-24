import { useState } from "react";
import {
  Columns2,
  Expand,
  Image as ImageIcon,
  MoveHorizontal,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function RenderImage({
  url,
  label,
  className = "h-[55dvh] max-h-[680px] w-full",
}: {
  url: string;
  label: string;
  className?: string;
}) {
  const t = useT();
  const [failed, setFailed] = useState<string | null>(null);
  return failed === url ? (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground ${className}`}
    >
      <ImageIcon className="h-7 w-7" aria-hidden="true" />
      {t("Immagine non disponibile")}
    </div>
  ) : (
    <img
      src={url}
      alt={label}
      className={`bg-slate-100 object-contain ${className}`}
      onError={() => setFailed(url)}
      decoding="async"
    />
  );
}

interface Props {
  beforeUrl?: string | null;
  afterUrl: string;
  beforeLabel?: string;
  title: string;
}
export function RenderDetailViewer({
  beforeUrl,
  afterUrl,
  beforeLabel: beforeLabelProp,
  title,
}: Props) {
  const t = useT();
  const beforeLabel = beforeLabelProp ?? t("Immagine di partenza");
  const [mode, setMode] = useState<"result" | "slider" | "split">("result");
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fullSource, setFullSource] = useState(false);
  const currentMode = beforeUrl ? mode : "result";
  const fullUrl = fullSource && beforeUrl ? beforeUrl : afterUrl;
  const fullLabel = fullSource && beforeUrl ? beforeLabel : title;
  return (
    <section
      aria-label={t("Visualizzatore del render")}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2 sm:p-3">
        <div
          role="group"
          aria-label={t("Modalità di confronto")}
          className="flex flex-wrap gap-1"
        >
          <Button
            variant={currentMode === "result" ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={currentMode === "result"}
            onClick={() => setMode("result")}
          >
            <ImageIcon className="mr-1.5 h-4 w-4" />
            {t("Risultato")}
          </Button>
          <Button
            variant={currentMode === "slider" ? "secondary" : "ghost"}
            size="sm"
            disabled={!beforeUrl}
            aria-pressed={currentMode === "slider"}
            onClick={() => setMode("slider")}
          >
            <MoveHorizontal className="mr-1.5 h-4 w-4" />
            {t("Confronto")}
          </Button>
          <Button
            variant={currentMode === "split" ? "secondary" : "ghost"}
            size="sm"
            disabled={!beforeUrl}
            aria-pressed={currentMode === "split"}
            onClick={() => setMode("split")}
          >
            <Columns2 className="mr-1.5 h-4 w-4" />
            {t("Affiancati")}
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setZoom(1);
            setFullSource(false);
            setFullscreen(true);
          }}
          aria-label={t("Ingrandisci il render")}
        >
          <Expand className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">{t("Ingrandisci")}</span>
        </Button>
      </div>
      {currentMode === "slider" && beforeUrl ? (
        <BeforeAfterSlider
          beforeUrl={beforeUrl}
          afterUrl={afterUrl}
          beforeLabel={beforeLabel}
          afterLabel={t("Risultato AI")}
          preserveWholeImage
          className="h-[55dvh] max-h-[680px] !aspect-auto"
        />
      ) : currentMode === "split" && beforeUrl ? (
        <div className="grid gap-px bg-border md:grid-cols-2">
          <figure className="bg-card">
            <figcaption className="p-2 text-xs font-medium">
              {beforeLabel}
            </figcaption>
            <RenderImage url={beforeUrl} label={beforeLabel} />
          </figure>
          <figure className="bg-card">
            <figcaption className="p-2 text-xs font-medium">
              {t("Risultato AI")}
            </figcaption>
            <RenderImage url={afterUrl} label={title} />
          </figure>
        </div>
      ) : (
        <RenderImage url={afterUrl} label={title} />
      )}
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {beforeUrl
          ? t("Le immagini sono mostrate intere. Usa il confronto per verificare aperture, disposizione e finiture.")
          : t("Il risultato resta consultabile. L’immagine di partenza non è disponibile per il confronto.")}
      </p>
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-h-[95dvh] w-[96vw] max-w-7xl overflow-y-auto p-3 sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {t("Ingrandisci l’immagine e scorri per controllare i dettagli.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={!fullSource ? "secondary" : "ghost"}
                onClick={() => setFullSource(false)}
              >
                {t("Risultato AI")}
              </Button>
              {beforeUrl && (
                <Button
                  size="sm"
                  variant={fullSource ? "secondary" : "ghost"}
                  onClick={() => setFullSource(true)}
                >
                  {beforeLabel}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label={t("Riduci zoom")}
                disabled={zoom <= 1}
                onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span
                className="w-12 text-center text-xs tabular-nums"
                aria-live="polite"
              >
                {Math.round(zoom * 100)}%
              </span>
              <Button
                size="icon"
                variant="outline"
                aria-label={t("Aumenta zoom")}
                disabled={zoom >= 4}
                onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("Ripristina zoom")}
                onClick={() => setZoom(1)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div
            className="h-[65dvh] overflow-auto rounded-lg border bg-slate-100"
            tabIndex={0}
            aria-label={t("Immagine ingrandita, scorri per esplorare")}
          >
            <img
              src={fullUrl}
              alt={fullLabel}
              className="max-w-none object-contain"
              style={{ width: `${zoom * 100}%`, height: `${zoom * 65}dvh` }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
