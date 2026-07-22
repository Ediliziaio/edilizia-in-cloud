/**
 * coverStockImages.ts — Galleria immagini stock per la cover del PDF (Serramenti).
 *
 * Immagini PROPRIETARIE EiC (non più Unsplash), servite come asset statici da
 * `public/cover-stock/serramenti/`. JPEG ad alta qualità ottimizzati per il PDF;
 * thumbnail più leggere per la griglia dell'editor.
 *
 * `pdf_cover_image_url` viene settato con l'URL full; react-pdf lo carica alla
 * generazione del PDF.
 */
export interface CoverStockImage {
  id: string;
  /** URL full-resolution (per pdf_cover_image_url). */
  url: string;
  /** URL thumbnail (per grid editor). Più leggera. */
  thumb: string;
  /** Etichetta breve mostrata sotto la thumb in hover. */
  label: string;
  /** Categoria di appartenenza (per filtro tab). */
  categoria: string;
}

const BASE = "/cover-stock/serramenti";
const COUNT = 10;

export const COVER_STOCK_IMAGES: CoverStockImage[] = Array.from({ length: COUNT }, (_, i) => {
  const n = i + 1;
  return {
    id: `sr-cover-${n}`,
    url: `${BASE}/${n}.jpg`,
    thumb: `${BASE}/${n}-thumb.jpg`,
    label: `Serramenti · copertina ${n}`,
    categoria: "serramenti",
  };
});

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all", label: "Tutte", emoji: "✨" },
];
