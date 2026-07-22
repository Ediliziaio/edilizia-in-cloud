/**
 * coverStockImages.ts — Galleria immagini stock per la cover del PDF (modulo Bagni).
 *
 * Immagini PROPRIETARIE EiC (non più Unsplash), servite come asset statici da
 * `public/cover-stock/bagni/`. JPEG ad alta qualità ottimizzati; thumbnail più
 * leggere per la griglia dell'editor.
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

const BASE = "/cover-stock/bagni";
const COUNT = 4;

export const COVER_STOCK_IMAGES: CoverStockImage[] = Array.from({ length: COUNT }, (_, i) => {
  const n = i + 1;
  return {
    id: `bgn-cover-${n}`,
    url: `${BASE}/${n}.jpg`,
    thumb: `${BASE}/${n}-thumb.jpg`,
    label: `Bagno · copertina ${n}`,
    categoria: "bagno",
  };
});

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all", label: "Tutte", emoji: "✨" },
];
