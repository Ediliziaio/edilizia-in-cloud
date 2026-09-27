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

// Le 3 copertine "storiche" (nomi numerici 1.jpg…3.jpg) e le 2 varianti aggiunte
// il 27/09/2026 (fotovoltaico-variante-07/08.jpg): tutte insieme nella galleria.
const EXTRA_VARIANTI = ["fotovoltaico-variante-07", "fotovoltaico-variante-08"] as const;

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  ...Array.from({ length: COUNT }, (_, i) => {
    const n = i + 1;
    return {
      id: `fv-cover-${n}`,
      url: `${BASE}/${n}.jpg`,
      thumb: `${BASE}/${n}-thumb.jpg`,
      label: `Fotovoltaico · copertina ${n}`,
      categoria: "fotovoltaico",
    };
  }),
  ...EXTRA_VARIANTI.map((slug, i) => ({
    id: `fv-cover-eic-${COUNT + i + 1}`,
    url: `${BASE}/${slug}.jpg`,
    // Nessun thumb dedicato per queste varianti: si mostra l'immagine piena.
    thumb: `${BASE}/${slug}.jpg`,
    label: `Fotovoltaico · variante ${COUNT + i + 1}`,
    categoria: "fotovoltaico",
  })),
];

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; emoji: string; label: string }> = [
  { value: "all", emoji: "✨", label: "Tutte" },
];
