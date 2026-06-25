/**
 * coverStockImages.ts — Galleria immagini stock per cover PDF (modulo Tetti).
 *
 * Clone strutturale di `src/components/bagni/coverStockImages.ts` e
 * `src/components/serramenti/coverStockImages.ts`, con soggetti a tema
 * tetto/copertura/lattoneria. Tutte da Unsplash (licenza free, uso commerciale
 * OK senza attribuzione obbligatoria — vedi https://unsplash.com/license).
 *
 * URL fissati a w=1600 q=80 fmt=auto → bilanciamento qualità/peso PDF.
 * I thumbnail in editor sono w=300 (più leggeri).
 *
 * No upload backend richiesto: setta direttamente `cover_image_url`
 * con l'URL Unsplash. react-pdf scarica l'immagine alla generazione del PDF.
 */

export interface CoverStockImage {
  id: string;
  /** URL full-resolution (per cover_image_url). */
  url: string;
  /** URL thumbnail (per grid editor). Più leggera. */
  thumb: string;
  /** Etichetta breve mostrata sotto la thumb in hover. */
  label: string;
  /** Categoria di appartenenza (per filtro tab). */
  categoria: "tetto" | "cantiere" | "dettaglio" | "texture" | "architettura";
}

// Funzione helper per generare URL Unsplash con dimensioni controllate.
// `id` è la parte finale dell'URL canonico /photos/<id>.
const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // ─── Tetto / copertura (5) ───────────────────────────────────────────
  { id: "tet-1", ...ufy("1632759145351-1d592919f522"), label: "Tetto in tegole",       categoria: "tetto" },
  { id: "tet-2", ...ufy("1605276374104-dee2a0ed3cd6"), label: "Copertura residenziale", categoria: "tetto" },
  { id: "tet-3", ...ufy("1632154920990-9a3c0f50f96f"), label: "Tetto al tramonto",     categoria: "tetto" },
  { id: "tet-4", ...ufy("1568901839119-631418a3910d"), label: "Casa con tetto spiovente", categoria: "tetto" },
  { id: "tet-5", ...ufy("1605146769289-440113cc3d00"), label: "Tegole in cotto",       categoria: "tetto" },

  // ─── Cantiere copertura (4) ──────────────────────────────────────────
  { id: "can-1", ...ufy("1503387762-cf4d2c5e4dca"),    label: "Cantiere copertura",    categoria: "cantiere" },
  { id: "can-2", ...ufy("1581094794329-c8112a89af12"), label: "Lavori sul tetto",      categoria: "cantiere" },
  { id: "can-3", ...ufy("1504307651254-35680f356dfd"), label: "Operai al lavoro",      categoria: "cantiere" },
  { id: "can-4", ...ufy("1486406146926-c627a92ad1ab"), label: "Sopralluogo tecnico",   categoria: "cantiere" },

  // ─── Dettaglio (4) ───────────────────────────────────────────────────
  { id: "det-1", ...ufy("1622021142947-da7dedc7c39a"), label: "Linea di gronda",       categoria: "dettaglio" },
  { id: "det-2", ...ufy("1635424709842-c0d4f3a6e0a3"), label: "Lattoneria e scossaline", categoria: "dettaglio" },
  { id: "det-3", ...ufy("1565182999561-18d7dc61c393"), label: "Dettaglio coibentazione", categoria: "dettaglio" },
  { id: "det-4", ...ufy("1558036117-15d82a90b9b1"),    label: "Pannelli solari su tetto", categoria: "dettaglio" },

  // ─── Texture neutra (3) ──────────────────────────────────────────────
  { id: "tex-1", ...ufy("1557683316-973673baf926"),    label: "Pattern minimal blu",   categoria: "texture" },
  { id: "tex-2", ...ufy("1557683304-673a23048d34"),    label: "Gradient sobrio",       categoria: "texture" },
  { id: "tex-3", ...ufy("1558618666-fcd25c85cd64"),    label: "Texture geometrica",    categoria: "texture" },

  // ─── Architettura (3) ────────────────────────────────────────────────
  { id: "arc-1", ...ufy("1486325212027-8081e485255e"), label: "Skyline urbano",        categoria: "architettura" },
  { id: "arc-2", ...ufy("1545324418-cc1a3fa10c00"),    label: "Facciata moderna",      categoria: "architettura" },
  { id: "arc-3", ...ufy("1487958449943-2429e8be8625"), label: "Architettura pulita",   categoria: "architettura" },
];

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all",          label: "Tutte",        emoji: "✨" },
  { value: "tetto",        label: "Tetto",        emoji: "🏠" },
  { value: "cantiere",     label: "Cantiere",     emoji: "🏗️" },
  { value: "dettaglio",    label: "Dettaglio",    emoji: "🔧" },
  { value: "texture",      label: "Texture",      emoji: "🎨" },
  { value: "architettura", label: "Architettura", emoji: "🏙️" },
];
