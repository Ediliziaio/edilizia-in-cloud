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
// La terza immagine storica era una piscina: fuori tema per una galleria
// generica di ristrutturazione. La teniamo fuori dalla selezione finché non
// viene sostituita con una foto coerente di cantiere o di risultato finale.
const FILES = [1, 2] as const;

export const COVER_STOCK_IMAGES: CoverStockImage[] = FILES.map((n) => {
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
