/**
 * La miniatura di un prodotto del listino (foto quadrata, fondo bianco) nel selettore voci,
 * nella riga del computo e nell'anteprima a destra.
 *
 * Senza foto, o se la foto non si carica, non compare niente: al suo posto va quello che
 * si passa in `alternativa` (nel selettore, l'icona del tipo di voce).
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  src: string | null | undefined;
  className?: string;
  alternativa?: ReactNode;
}

export function MiniaturaProdotto({ src, className, alternativa = null }: Props) {
  // Si ricorda QUALE foto non si è caricata: se la riga passa a un'altra foto, la nuova si prova.
  const [fotoRotta, setFotoRotta] = useState<string | null>(null);
  if (!src || fotoRotta === src) return <>{alternativa}</>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFotoRotta(src)}
      className={cn("shrink-0 rounded-md border border-slate-200 bg-white object-contain", className)}
    />
  );
}
