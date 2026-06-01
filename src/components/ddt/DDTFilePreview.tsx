// ============================================================================
// DDTFilePreview — Anteprima inline di foto e PDF con lightbox
// ----------------------------------------------------------------------------
// Tipologie:
//   - Immagini (jpg/png/webp/heic): thumbnail + lightbox a schermo intero
//   - PDF: card con icona + apertura in nuova tab + <object> embed opzionale
//   - Altri tipi (doc, xls): card con icona generica + download
// ============================================================================

import { useState } from "react";
import {
  FileText, FileImage, Download, ExternalLink, X, Trash2, ZoomIn,
  Eye, File as FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DDTAttachmentKind } from "@/hooks/useDDTRicezione";

const KIND_LABELS: Record<DDTAttachmentKind, string> = {
  ddt: "DDT",
  bolla: "Bolla",
  danni: "Danni",
  packing_list: "Packing list",
  firma: "Firma",
  altro: "Allegato",
};

const KIND_COLORS: Record<DDTAttachmentKind, string> = {
  ddt: "bg-primary/10 text-primary border-primary/30",
  bolla: "bg-blue-50 text-blue-700 border-blue-200",
  danni: "bg-rose-50 text-rose-700 border-rose-200",
  packing_list: "bg-violet-50 text-violet-700 border-violet-200",
  firma: "bg-emerald-50 text-emerald-700 border-emerald-200",
  altro: "bg-muted text-muted-foreground border-border",
};

const isImage = (mime: string) => mime.startsWith("image/");
const isPdf = (mime: string) => mime === "application/pdf";

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Lightbox per immagini e PDF ─────────────────────────────────────────────
interface LightboxProps {
  open: boolean;
  onClose: () => void;
  url: string;
  name: string;
  mime: string;
}

function Lightbox({ open, onClose, url, name, mime }: LightboxProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-5xl max-h-[95vh] w-full p-0 overflow-hidden bg-black/95 border-black/60"
        onInteractOutside={onClose}
      >
        <div className="relative flex flex-col h-[95vh]">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black/80 text-white/90">
            <div className="flex items-center gap-2 min-w-0">
              {isImage(mime) ? (
                <FileImage className="h-4 w-4 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate text-sm font-medium">{name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-white/80 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition"
                title="Apri in nuova tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={url}
                download={name}
                className="text-white/80 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition"
                title="Scarica"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition"
                title="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex items-center justify-center overflow-auto bg-black/95 p-2 sm:p-4">
            {isImage(mime) ? (
              <img loading="lazy"
                src={url}
                alt={name}
                className="max-w-full max-h-full object-contain rounded-md"
              />
            ) : isPdf(mime) ? (
              <object
                data={url}
                type="application/pdf"
                className="w-full h-full min-h-[70vh] rounded-md bg-white"
              >
                <div className="text-white text-center space-y-3 p-6">
                  <FileText className="h-12 w-12 mx-auto opacity-60" />
                  <p className="text-sm">Anteprima PDF non disponibile.</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-md hover:bg-white/90"
                  >
                    <ExternalLink className="h-4 w-4" /> Apri PDF
                  </a>
                </div>
              </object>
            ) : (
              <div className="text-white text-center space-y-3">
                <FileIcon className="h-12 w-12 mx-auto opacity-60" />
                <p className="text-sm">Anteprima non disponibile per questo tipo di file.</p>
                <a
                  href={url}
                  download={name}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-md"
                >
                  <Download className="h-4 w-4" /> Scarica {name}
                </a>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Thumb card (usata nelle liste allegati) ──────────────────────────────
interface DDTFilePreviewProps {
  url: string;
  name: string;
  mime: string;
  size?: number;
  kind?: DDTAttachmentKind;
  uploadedAt?: string;
  onDelete?: () => void;
  className?: string;
  /** Se true, mostra solo la thumb senza badge/metadati (layout compatto) */
  minimal?: boolean;
}

export function DDTFilePreview({
  url,
  name,
  mime,
  size,
  kind,
  uploadedAt,
  onDelete,
  className,
  minimal = false,
}: DDTFilePreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const canPreview = isImage(mime) || isPdf(mime);

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition-all",
          className,
        )}
      >
        {/* Thumb (image) o icon (pdf/altro) */}
        <button
          type="button"
          onClick={() => canPreview && setLightboxOpen(true)}
          disabled={!canPreview}
          className={cn(
            "relative w-full aspect-[4/3] flex items-center justify-center bg-muted/40",
            canPreview && "cursor-zoom-in",
          )}
        >
          {isImage(mime) ? (
            <>
              <img
                src={url}
                alt={name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </>
          ) : isPdf(mime) ? (
            <div className="flex flex-col items-center gap-2 p-4">
              <FileText className="h-10 w-10 text-rose-500" />
              <span className="text-[10px] font-mono bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                PDF
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 p-4">
              <FileIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          )}

          {/* Kind badge overlay */}
          {kind && !minimal && (
            <span
              className={cn(
                "absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded-md border font-medium backdrop-blur-sm",
                KIND_COLORS[kind],
              )}
            >
              {KIND_LABELS[kind]}
            </span>
          )}

          {/* Delete button */}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Rimuovere ${name}?`)) onDelete();
              }}
              className="absolute top-1.5 right-1.5 p-1 bg-rose-500/90 hover:bg-rose-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rimuovi"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </button>

        {/* Meta row */}
        {!minimal && (
          <div className="px-2.5 py-1.5 border-t">
            <p className="text-xs font-medium truncate" title={name}>
              {name}
            </p>
            <div className="flex items-center justify-between gap-1 mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {formatBytes(size || 0)}
              </span>
              <div className="flex items-center gap-0.5">
                {canPreview && (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    title="Anteprima"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  title="Apri"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={url}
                  download={name}
                  className="text-muted-foreground hover:text-foreground p-0.5"
                  title="Scarica"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="h-3 w-3" />
                </a>
              </div>
            </div>
            {uploadedAt && (
              <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                {new Date(uploadedAt).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>
        )}
      </div>

      <Lightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        url={url}
        name={name}
        mime={mime}
      />
    </>
  );
}

// ─── Main DDT document preview (hero/featured) ─────────────────────────
interface DDTMainFilePreviewProps {
  url: string;
  name: string;
  mime: string;
  onReplace?: () => void;
  onDelete?: () => void;
}

export function DDTMainFilePreview({
  url,
  name,
  mime,
  onReplace,
  onDelete,
}: DDTMainFilePreviewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <>
      <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Preview */}
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="relative w-20 h-24 sm:w-28 sm:h-32 rounded-md overflow-hidden border-2 border-primary/30 bg-muted shrink-0 group"
          >
            {isImage(mime) ? (
              <img loading="lazy" src={url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-rose-50">
                <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-rose-500" />
                <span className="text-[9px] font-mono bg-rose-100 text-rose-700 px-1 rounded mt-1">
                  PDF
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>

          {/* Info + actions */}
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground uppercase tracking-wide">
                DDT cartaceo
              </span>
              <p className="text-sm font-medium mt-1 break-all">{name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setLightboxOpen(true)}
              >
                <Eye className="h-3 w-3 mr-1" />
                Anteprima
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-7 text-xs"
              >
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Apri
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="h-7 text-xs"
              >
                <a href={url} download={name}>
                  <Download className="h-3 w-3 mr-1" />
                  Scarica
                </a>
              </Button>
              {onReplace && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onReplace}
                  className="h-7 text-xs"
                >
                  Sostituisci
                </Button>
              )}
              {onDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => confirm(`Rimuovere il documento DDT "${name}"?`) && onDelete()}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Lightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        url={url}
        name={name}
        mime={mime}
      />
    </>
  );
}
