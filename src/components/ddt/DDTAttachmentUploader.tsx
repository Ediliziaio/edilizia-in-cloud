// ============================================================================
// DDTAttachmentUploader — Zona drag-drop + camera mobile + file picker
// ----------------------------------------------------------------------------
// Sorgenti supportate:
//   • Drag & drop (desktop)
//   • Click → file picker (foto/PDF/documenti)
//   • Fotocamera mobile (capture="environment") — on mobile browsers
//   • Gallery mobile (accept="image/*")
//
// Usa:
//   <DDTAttachmentUploader onFilesSelected={(files) => ...}
//      defaultKind="ddt" multiple accept="image/*,application/pdf" />
// ============================================================================

import { useRef, useState, useCallback, type DragEvent } from "react";
import {
  Camera, Upload, Image as ImageIcon, FileText, Paperclip, X,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DDTAttachmentKind } from "@/hooks/useDDTRicezione";

interface DDTAttachmentUploaderProps {
  /** Tipologia default per i file caricati (ddt, bolla, danni, ecc.) */
  defaultKind?: DDTAttachmentKind;
  /** File selezionati vengono restituiti al parent (che gestisce l'upload) */
  onFilesSelected: (files: { file: File; kind: DDTAttachmentKind }[]) => void;
  /** Multipli o singolo */
  multiple?: boolean;
  /** Mime accepts (default: foto + pdf) */
  accept?: string;
  /** Dimensione max MB per file (default 20) */
  maxSizeMB?: number;
  /** Stato loading durante upload parent */
  isUploading?: boolean;
  /** Variante compatta (senza intestazione/label) */
  compact?: boolean;
  /** Titolo custom (es. "Carica DDT", "Aggiungi foto danni") */
  title?: string;
  /** Descrizione sotto il titolo */
  description?: string;
  className?: string;
}

const DEFAULT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";

export function DDTAttachmentUploader({
  defaultKind = "ddt",
  onFilesSelected,
  multiple = true,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 20,
  isUploading = false,
  compact = false,
  title,
  description,
  className,
}: DDTAttachmentUploaderProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const validateAndSubmit = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const valid: { file: File; kind: DDTAttachmentKind }[] = [];
      const errors: string[] = [];
      const maxBytes = maxSizeMB * 1024 * 1024;

      Array.from(files).forEach((f) => {
        if (f.size > maxBytes) {
          errors.push(`${f.name}: troppo grande (max ${maxSizeMB} MB)`);
          return;
        }
        valid.push({ file: f, kind: defaultKind });
      });

      setRejected(errors);
      if (valid.length > 0) {
        onFilesSelected(valid);
      }
    },
    [defaultKind, maxSizeMB, onFilesSelected],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    validateAndSubmit(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {!compact && title && (
        <div>
          <h3 className="text-sm font-medium flex items-center gap-1.5">
            <Paperclip className="h-4 w-4 text-primary" />
            {title}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      )}

      {/* ── Drop zone ───────────────────────────────────────── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-all overflow-hidden",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 bg-muted/20 hover:border-muted-foreground/40 hover:bg-muted/30",
          isUploading && "opacity-60 pointer-events-none",
          compact ? "p-3" : "p-4 sm:p-6",
        )}
      >
        {/* Hidden inputs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            validateAndSubmit(e.target.files);
            if (cameraRef.current) cameraRef.current.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            validateAndSubmit(e.target.files);
            if (galleryRef.current) galleryRef.current.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            validateAndSubmit(e.target.files);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />

        <div
          className={cn(
            "flex flex-col items-center text-center",
            compact ? "gap-2" : "gap-3",
          )}
        >
          {/* Icon */}
          <div
            className={cn(
              "rounded-full bg-primary/10 flex items-center justify-center shrink-0",
              compact ? "h-9 w-9" : "h-11 w-11 sm:h-14 sm:w-14",
            )}
          >
            <Upload
              className={cn(
                "text-primary",
                compact ? "h-4 w-4" : "h-5 w-5 sm:h-6 sm:w-6",
              )}
            />
          </div>

          {/* Helper text */}
          {!compact && (
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                <span className="hidden sm:inline">
                  Trascina qui i file o scegli una sorgente
                </span>
                <span className="sm:hidden">Scegli una sorgente</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Foto (JPG/PNG/HEIC) o PDF · max {maxSizeMB} MB per file
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-center gap-2 w-full",
              compact && "mt-0",
            )}
          >
            {/* Camera (prioritario su mobile) */}
            <Button
              type="button"
              variant="default"
              size={compact ? "sm" : "default"}
              onClick={() => cameraRef.current?.click()}
              disabled={isUploading}
              className="gap-1.5 sm:hidden flex-1 min-w-[120px]"
            >
              <Camera className="h-4 w-4" />
              Scatta foto
            </Button>

            {/* Gallery mobile */}
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={() => galleryRef.current?.click()}
              disabled={isUploading}
              className="gap-1.5 sm:hidden flex-1 min-w-[120px]"
            >
              <ImageIcon className="h-4 w-4" />
              Galleria
            </Button>

            {/* Desktop/file picker — visibile su mobile come fallback PDF */}
            <Button
              type="button"
              variant={compact ? "outline" : "default"}
              size={compact ? "sm" : "default"}
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="gap-1.5 flex-1 sm:flex-none min-w-[120px]"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Scegli file</span>
              <span className="sm:hidden">PDF / file</span>
            </Button>

            {/* Desktop-only: camera (se supportata nel browser) */}
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={() => cameraRef.current?.click()}
              disabled={isUploading}
              className="gap-1.5 hidden sm:flex"
            >
              <Camera className="h-4 w-4" />
              Fotocamera
            </Button>
          </div>

          {/* Upload in progress */}
          {isUploading && (
            <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              Caricamento in corso…
            </div>
          )}
        </div>
      </div>

      {/* Errori file rifiutati */}
      {rejected.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" />
            File rifiutati:
          </div>
          {rejected.map((msg, i) => (
            <p key={i} className="text-xs text-amber-700 pl-5">{msg}</p>
          ))}
          <button
            type="button"
            onClick={() => setRejected([])}
            className="text-[10px] text-amber-600 hover:text-amber-800 underline pl-5"
          >
            Nascondi
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Piccolo batch preview mostrato mentre l'upload è in corso ────────────
export function UploadingBatch({
  files,
}: {
  files: { name: string; status: "pending" | "done" | "error" }[];
}) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
      {files.map((f, i) => (
        <div key={i} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate flex-1">{f.name}</span>
          {f.status === "pending" && (
            <span className="inline-block h-3 w-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          )}
          {f.status === "done" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {f.status === "error" && <X className="h-3.5 w-3.5 text-rose-600" />}
        </div>
      ))}
    </div>
  );
}
