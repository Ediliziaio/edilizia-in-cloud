import { useState, type ComponentType, type ImgHTMLAttributes, type RefObject } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Presentation only: the caller keeps its existing local or remote upload adapter. */
export function TemplateImageFieldView({ label, hint, value, busy, disabled = false, localOnly = false, error, inputRef, onFile, onRemove, aspect = "aspect-video", imageComponent: Image = "img" }: {
  label: string; hint?: string; value: string | null; busy: boolean; disabled?: boolean;
  localOnly?: boolean; error?: string; inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File | null) => void | Promise<void>; onRemove: () => void; aspect?: string;
  imageComponent?: "img" | ComponentType<ImgHTMLAttributes<HTMLImageElement>>;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const blocked = busy || disabled;
  const max = localOnly ? 1 : 8;
  const help = hint?.replace(/max\s*8\s*MB/gi, `max ${max} MB`);
  return <div data-template-image-field data-local-only={localOnly || undefined} aria-busy={busy} className="min-w-0 space-y-2">
    <p className="text-sm font-medium">{label}</p>
    <div className={cn("relative flex max-h-48 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40", aspect)}>
      {value ? <Image src={value} alt={label} onError={() => setFailedImage(value)} onLoad={() => setFailedImage(null)} className="h-full w-full object-contain" />
        : <div className="flex flex-col items-center gap-2 p-3 text-xs text-muted-foreground"><ImagePlus className="h-6 w-6" aria-hidden="true" /><span>Nessuna immagine</span></div>}
      {busy && <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 bg-background/90 text-xs"><Loader2 className="h-5 w-5 animate-spin text-orange-600" aria-hidden="true" />Caricamento immagine…</div>}
    </div>
    <input ref={inputRef} type="file" aria-label={`Carica ${label.toLowerCase()}`} accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={blocked} onChange={event => {
      const file = event.target.files?.[0] ?? null;
      // Retry the same file even when validation fails before the async handler.
      event.target.value = "";
      void onFile(file);
    }} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={() => inputRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{value ? "Sostituisci" : "Carica"}</Button>
      {value && <Button type="button" size="sm" variant="ghost" aria-label={`Rimuovi ${label.toLowerCase()}`} disabled={blocked} onClick={onRemove}><Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Rimuovi</Button>}
    </div>
    {help && <p className="text-xs text-muted-foreground">{help}</p>}
    <p className="text-xs text-muted-foreground">PNG, JPG o WebP · massimo {max} MB.{localOnly && " Salvata solo in questo browser."}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {value && failedImage === value && <p role="alert" className="text-sm text-destructive">Immagine non disponibile. Sostituiscila o scegli un’altra foto dalla libreria.</p>}
  </div>;
}
