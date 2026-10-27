import { immaginiPerPdf, leggiImmaginiCatalogo, type ImmagineCatalogo } from "@/lib/listino/immaginiCatalogo";
import { toDataUrl } from "./pdfImageUtils";

export async function immaginiCatalogoPdf(raw: unknown, legacy?: string | null): Promise<ImmagineCatalogo[]> {
  const visibili = immaginiPerPdf(leggiImmaginiCatalogo(raw, legacy));
  const result: ImmagineCatalogo[] = [];
  for (const image of visibili) {
    const url = await toDataUrl(image.url).catch(() => null);
    if (url) result.push({ ...image, url });
  }
  return result;
}
