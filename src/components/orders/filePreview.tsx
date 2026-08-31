/**
 * Anteprime dei file di commessa — componenti.
 * Le funzioni e i tipi stanno in filePreviewUtils.ts (fast-refresh).
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileText, Download, ExternalLink, Loader2, ArrowLeft,
  ImageIcon, FileSpreadsheet, File as FileIcon,
} from "lucide-react";
import {
  fileKind, fmtBytes, openAttachmentInTab, KIND_LABEL,
  type FileKind, type PreviewableFile,
} from "./filePreviewUtils";

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "pdf") return <FileText className={className} />;
  if (kind === "sheet") return <FileSpreadsheet className={className} />;
  if (kind === "doc") return <FileText className={className} />;
  return <FileIcon className={className} />;
}

/** Miniatura quadrata: immagine vera quando si puo', altrimenti icona tipizzata. */
export function FileThumb({
  file, url, size = "md", loading,
}: { file: PreviewableFile; url?: string; size?: "sm" | "md"; loading?: boolean }) {
  const kind = fileKind(file);
  const box = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className={`${box} shrink-0 overflow-hidden rounded-md border bg-muted/40 flex items-center justify-center`}>
      {kind === "image" && url ? (
        <img src={url} alt={file.file_name} loading="lazy" className="h-full w-full object-cover" />
      ) : loading && kind === "image" ? (
        <Loader2 className={`${icon} animate-spin text-muted-foreground`} />
      ) : (
        <KindIcon kind={kind} className={`${icon} text-muted-foreground/70`} />
      )}
    </div>
  );
}

/**
 * Visualizzatore: immagine a schermo o PDF nel lettore del browser.
 * Niente librerie PDF da caricare — ci pensa il browser.
 */
export function FilePreviewDialog({
  file, url, open, onOpenChange, onDownload, onBack,
}: {
  file: PreviewableFile | null;
  url?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Se assente, il tasto Scarica apre il file in una scheda nuova. */
  onDownload?: (f: PreviewableFile) => void;
  /** Se presente, mostra la freccia "indietro" (es. per tornare alla griglia). */
  onBack?: () => void;
}) {
  if (!file) return null;
  const kind = fileKind(file);
  const peso = fmtBytes(file.file_size);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            {onBack && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack} aria-label="Torna ai documenti">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <KindIcon kind={kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-base">{file.file_name}</span>
          </DialogTitle>
          <DialogDescription>{KIND_LABEL[kind]}{peso ? ` · ${peso}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30">
          {!url ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparo l'anteprima…
            </div>
          ) : kind === "image" ? (
            <img src={url} alt={file.file_name} className="mx-auto max-h-[62vh] object-contain" />
          ) : kind === "pdf" ? (
            <iframe src={url} title={file.file_name} className="h-[62vh] w-full border-0 bg-white" />
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-2 px-6 text-center">
              <KindIcon kind={kind} className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                Questo tipo di file non si può sfogliare qui: scaricalo o aprilo in una scheda nuova.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 pt-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openAttachmentInTab(file.file_url)}>
            <ExternalLink className="h-4 w-4" /> Apri in una scheda
          </Button>
          <Button size="sm" className="gap-1.5"
            onClick={() => (onDownload ? onDownload(file) : openAttachmentInTab(file.file_url))}>
            <Download className="h-4 w-4" /> Scarica
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
