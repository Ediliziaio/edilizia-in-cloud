import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import { cn } from "@/lib/utils";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker.ts";

interface Props {
  /** La foto che il motore allega per la scelta corrente; se manca non si mostra niente. */
  foto?: Pick<PhotoEntry, "folder" | "filename"> | null;
  alt: string;
  className?: string;
}

/**
 * Miniatura quadrata accanto a una tendina o in una scheda: la stessa foto che il render
 * riceverà per quella scelta. Usata dal form del pavimento e da quello della stanza.
 */
export function AnteprimaFoto({ foto, alt, className }: Props) {
  if (!foto) return null;
  return (
    <span className={cn("block h-10 w-10 shrink-0 overflow-hidden rounded border bg-muted", className)}>
      <ReferenceThumb photo={foto} alt={alt} />
    </span>
  );
}
