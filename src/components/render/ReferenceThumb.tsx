import { useState } from "react";
import { cn } from "@/lib/utils";
import { referenceThumbUrl } from "../../../shared/render-references/thumbs.ts";
import type { PhotoEntry } from "../../../shared/render-references/referencePicker.ts";

interface Props {
  /** La foto della libreria (la stessa che il motore allega al render). */
  photo: Pick<PhotoEntry, "folder" | "filename">;
  /** Cosa mostra, per chi non vede l'immagine («Doccia walk-in»). */
  alt: string;
  className?: string;
}

/**
 * Miniatura di una foto di riferimento dentro un'opzione del form: l'utente sceglie
 * guardando il prodotto vero invece di una sagoma disegnata in CSS. Se il file non
 * si carica sparisce senza lasciare un'icona rotta: l'opzione resta scegliibile dal testo.
 */
export function ReferenceThumb({ photo, alt, className }: Props) {
  const [rotta, setRotta] = useState(false);
  if (rotta) return null;
  return (
    <img
      src={referenceThumbUrl(photo.folder, photo.filename)}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setRotta(true)}
      className={cn("aspect-square h-full w-full select-none object-cover", className)}
    />
  );
}
