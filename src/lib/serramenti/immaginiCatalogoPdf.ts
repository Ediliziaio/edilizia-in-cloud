import { immaginiPerPdf, leggiImmaginiCatalogo, type ImmagineCatalogo } from "@/lib/listino/immaginiCatalogo";
import { toDataUrl } from "./pdfImageUtils";

/**
 * Le immagini di una scheda, convertite per il PDF. Si caricano insieme, non
 * una dopo l'altra (23/11/2026): una foto che non risponde tiene il suo
 * timeout, non lo somma a quello di tutte le altre.
 */
export async function immaginiCatalogoPdf(raw: unknown, legacy?: string | null): Promise<ImmagineCatalogo[]> {
  const visibili = immaginiPerPdf(leggiImmaginiCatalogo(raw, legacy));
  const convertite = await Promise.all(
    visibili.map((image) => toDataUrl(image.url).catch((): string | null => null)),
  );
  return visibili
    .map((image, i) => (convertite[i] ? { ...image, url: convertite[i]! } : null))
    .filter((image): image is ImmagineCatalogo => image !== null);
}
