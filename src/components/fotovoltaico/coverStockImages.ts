/**
 * coverStockImages.ts (Fotovoltaico) — Galleria immagini stock per la cover PDF.
 *
 * Immagini PROPRIETARIE EiC (non più Unsplash), servite come asset statici da
 * `public/cover-stock/fotovoltaico/`. JPEG ad alta qualità ottimizzati; thumbnail
 * più leggere per la griglia dell'editor.
 */
export interface CoverStockImage {
  id: string;
  url: string;
  thumb: string;
  label: string;
  categoria: string;
}

const BASE = "/cover-stock/fotovoltaico";
const COUNT = 3;

export const COVER_STOCK_IMAGES: CoverStockImage[] = Array.from({ length: COUNT }, (_, i) => {
  const n = i + 1;
  return {
    id: `fv-cover-${n}`,
    url: `${BASE}/${n}.jpg`,
    thumb: `${BASE}/${n}-thumb.jpg`,
    label: `Fotovoltaico · copertina ${n}`,
    categoria: "fotovoltaico",
  };
});

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; emoji: string; label: string }> = [
  { value: "all", emoji: "✨", label: "Tutte" },
];
