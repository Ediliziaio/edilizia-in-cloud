/**
 * Miniature dei file di commessa e cliente.
 * Le funzioni e i tipi stanno in filePreviewUtils.ts (fast-refresh).
 *
 * La miniatura è quella creata al caricamento e salvata accanto al file
 * (thumb_path); senza, un'icona per tipo. Cliccando, il file si scarica.
 */
import { useState } from "react";
import { FileText, ImageIcon, FileSpreadsheet, File as FileIcon } from "lucide-react";
import { fileKind, type FileKind, type PreviewableFile } from "./filePreviewUtils";

export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "pdf") return <FileText className={className} />;
  if (kind === "sheet") return <FileSpreadsheet className={className} />;
  if (kind === "doc") return <FileText className={className} />;
  return <FileIcon className={className} />;
}

/** `size="tile"` riempie il riquadro della griglia. */
export function FileThumb({
  file, thumbUrl, size = "md",
}: {
  file: PreviewableFile;
  /** URL firmato della miniatura salvata accanto al file. */
  thumbUrl?: string;
  size?: "sm" | "md" | "tile";
}) {
  const kind = fileKind(file);
  const box = size === "tile" ? "h-full w-full" : size === "sm" ? "h-10 w-10 rounded-md border" : "h-12 w-12 rounded-md border";
  const icon = size === "tile" ? "h-8 w-8" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const [rotta, setRotta] = useState(false);

  return (
    <div className={`${box} shrink-0 overflow-hidden bg-muted/40 flex items-center justify-center`}>
      {thumbUrl && !rotta ? (
        <img
          src={thumbUrl}
          alt={file.file_name}
          loading="lazy"
          className={`h-full w-full object-cover ${kind === "pdf" ? "object-top" : ""}`}
          onError={() => setRotta(true)}
        />
      ) : (
        <KindIcon kind={kind} className={`${icon} text-muted-foreground/70`} />
      )}
    </div>
  );
}
