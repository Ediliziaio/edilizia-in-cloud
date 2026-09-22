/**
 * coverStockImages.ts — Galleria immagini stock per cover PDF (modulo Piscine).
 *
 * Clone strutturale di `src/components/bagni/coverStockImages.ts` (a sua volta
 * derivato da serramenti), con soggetti a tema piscina/acqua/relax. Tutte da
 * Unsplash (licenza free, uso commerciale OK senza attribuzione obbligatoria —
 * vedi https://unsplash.com/license).
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
  categoria: "piscina" | "cantiere" | "dettaglio" | "texture" | "architettura";
}

// Funzione helper per generare URL Unsplash con dimensioni controllate.
// `id` è la parte finale dell'URL canonico /photos/<id>.
const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // La copertina di serie, nostra (public/cover-stock/piscine, 22/09/2026): la prima proposta.
  { id: "pis-eic-1", url: "/cover-stock/piscine/1.jpg", thumb: "/cover-stock/piscine/1-thumb.jpg", label: "Piscina al tramonto", categoria: "piscina" },
  // ─── Piscina (4) ─────────────────────────────────────────────────────
  { id: "pis-1", ...ufy("1572331165267-854da2b10ccc"), label: "Piscina infinity",      categoria: "piscina" },
  { id: "pis-2", ...ufy("1576013551627-0cc20b96c2a7"), label: "Piscina residenziale",  categoria: "piscina" },
  { id: "pis-3", ...ufy("1571902943202-507ec2618e8f"), label: "Acqua cristallina",     categoria: "piscina" },
  { id: "pis-4", ...ufy("1535262412227-85541e910204"), label: "Bordo piscina relax",   categoria: "piscina" },

  // ─── Cantiere (4) ────────────────────────────────────────────────────
  { id: "can-1", ...ufy("1581094794329-c8112a89af12"), label: "Cantiere edile",        categoria: "cantiere" },
  { id: "can-2", ...ufy("1503387762-cf4d2c5e4dca"),    label: "Posa rivestimenti",     categoria: "cantiere" },
  { id: "can-3", ...ufy("1504307651254-35680f356dfd"), label: "Operai al lavoro",      categoria: "cantiere" },
  { id: "can-4", ...ufy("1486406146926-c627a92ad1ab"), label: "Sopralluogo tecnico",   categoria: "cantiere" },

  // ─── Dettaglio (4) ───────────────────────────────────────────────────
  { id: "det-1", ...ufy("1566073771259-6a8506099945"), label: "Lettini e ombrellone",  categoria: "dettaglio" },
  { id: "det-2", ...ufy("1540541338287-41700207dee6"), label: "Idromassaggio",         categoria: "dettaglio" },
  { id: "det-3", ...ufy("1547036967-23d11aacaee0"),    label: "Pavimento bordo vasca", categoria: "dettaglio" },
  { id: "det-4", ...ufy("1561501900-3701fa6a0864"),    label: "Riflessi sull'acqua",   categoria: "dettaglio" },

  // ─── Texture neutra (3) ──────────────────────────────────────────────
  { id: "tex-1", ...ufy("1557683316-973673baf926"),    label: "Pattern minimal blu",   categoria: "texture" },
  { id: "tex-2", ...ufy("1557683304-673a23048d34"),    label: "Gradient sobrio",       categoria: "texture" },
  { id: "tex-3", ...ufy("1558618666-fcd25c85cd64"),    label: "Texture geometrica",    categoria: "texture" },

  // ─── Architettura (3) ────────────────────────────────────────────────
  { id: "arc-1", ...ufy("1512917774080-9991f1c4c750"), label: "Villa con piscina",     categoria: "architettura" },
  { id: "arc-2", ...ufy("1545324418-cc1a3fa10c00"),    label: "Facciata moderna",      categoria: "architettura" },
  { id: "arc-3", ...ufy("1487958449943-2429e8be8625"), label: "Architettura pulita",   categoria: "architettura" },
];

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all",          label: "Tutte",        emoji: "✨" },
  { value: "piscina",      label: "Piscina",      emoji: "🏊" },
  { value: "cantiere",     label: "Cantiere",     emoji: "🏗️" },
  { value: "dettaglio",    label: "Dettaglio",    emoji: "💧" },
  { value: "texture",      label: "Texture",      emoji: "🎨" },
  { value: "architettura", label: "Architettura", emoji: "🏙️" },
];
