/**
 * coverStockImages.ts — Galleria immagini stock per la cover del PDF (Ristrutturazione).
 *
 * Immagini PROPRIETARIE EiC (non più Unsplash), servite come asset statici da
 * `public/cover-stock/ristrutturazione/`. JPEG ad alta qualità ottimizzati;
 * thumbnail più leggere per la griglia dell'editor.
 */
export interface CoverStockImage {
  id: string;
  /** URL full-resolution (per pdf_cover_image_url). */
  url: string;
  /** URL thumbnail (per grid editor). Più leggera. */
  thumb: string;
  label: string;
  categoria: string;
}

const BASE = "/cover-stock/ristrutturazione";
const COUNT = 3;

export const COVER_STOCK_IMAGES: CoverStockImage[] = Array.from({ length: COUNT }, (_, i) => {
  const n = i + 1;
  return {
    id: `rst-cover-${n}`,
    url: `${BASE}/${n}.jpg`,
    thumb: `${BASE}/${n}-thumb.jpg`,
    label: `Ristrutturazione · copertina ${n}`,
    categoria: "ristrutturazione",
  };
});

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all", label: "Tutte", emoji: "✨" },
];
