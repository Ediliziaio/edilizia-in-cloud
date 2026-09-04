/**
 * Immagine da un contenitore riservato (foto di cantiere, firme).
 *
 * Uguale a <img>, ma l'indirizzo passa prima da un link a scadenza: cosi' le
 * foto restano visibili anche dopo la chiusura del contenitore al pubblico.
 * Vedi src/lib/storage/fileRiservati.ts.
 */
import { useFileRiservato } from "@/hooks/useFileRiservati";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

export function ImgRiservata({ src, ...resto }: Props) {
  const link = useFileRiservato(src);
  if (!link) return null;
  return <img src={link} {...resto} />;
}
