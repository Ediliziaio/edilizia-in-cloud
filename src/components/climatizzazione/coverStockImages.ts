/**
 * coverStockImages.ts — Galleria immagini stock per cover PDF (modulo Climatizzazione).
 *
 * Clone strutturale di `src/components/bagni/coverStockImages.ts` e
 * `src/components/serramenti/coverStockImages.ts`, con soggetti a tema
 * climatizzazione/comfort residenziale. Tutte da Unsplash (licenza free,
 * uso commerciale OK senza attribuzione obbligatoria — vedi
 * https://unsplash.com/license).
 *
 * URL fissati a w=1600 q=80 fmt=auto → bilanciamento qualità/peso PDF.
 * I thumbnail in editor sono w=300 (più leggeri).
 *
 * No upload backend richiesto: setta direttamente `pdf_cover_image_url`
 * con l'URL Unsplash. react-pdf scarica l'immagine alla generazione del PDF.
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
  categoria: "clima" | "residenziale" | "cantiere" | "texture" | "architettura";
}

// Funzione helper per generare URL Unsplash con dimensioni controllate.
// `id` è la parte finale dell'URL canonico /photos/<id>.
const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // La copertina di serie, nostra (public/cover-stock/climatizzazione, 22/09/2026): la prima proposta.
  { id: "clm-eic-1", url: "/cover-stock/climatizzazione/1.jpg", thumb: "/cover-stock/climatizzazione/1-thumb.jpg", label: "Soggiorno climatizzato", categoria: "clima" },
  // ─── Clima / comfort (4) ─────────────────────────────────────────────
  { id: "clm-1", ...ufy("1631545806609-c2b999c9e9f9"), label: "Split a parete",        categoria: "clima" },
  { id: "clm-2", ...ufy("1567769541495-138a0a3b0d0e"), label: "Telecomando clima",     categoria: "clima" },
  { id: "clm-3", ...ufy("1635048424329-a9bfb146d7aa"), label: "Unità esterna",         categoria: "clima" },
  { id: "clm-4", ...ufy("1581094288338-2314dddb7ece"), label: "Installazione impianto", categoria: "clima" },

  // ─── Residenziale (4) ────────────────────────────────────────────────
  { id: "res-1", ...ufy("1502672260266-1c1ef2d93688"), label: "Casa moderna",          categoria: "residenziale" },
  { id: "res-2", ...ufy("1600585154340-be6161a56a0c"), label: "Soggiorno luminoso",    categoria: "residenziale" },
  { id: "res-3", ...ufy("1560448204-e02f11c3d0e2"),    label: "Interno contemporaneo", categoria: "residenziale" },
  { id: "res-4", ...ufy("1565538810643-b5bdb714032a"), label: "Camera confortevole",   categoria: "residenziale" },

  // ─── Cantiere (3) ────────────────────────────────────────────────────
  { id: "can-1", ...ufy("1504307651254-35680f356dfd"), label: "Operai al lavoro",      categoria: "cantiere" },
  { id: "can-2", ...ufy("1581094794329-c8112a89af12"), label: "Installazione tecnica", categoria: "cantiere" },
  { id: "can-3", ...ufy("1486406146926-c627a92ad1ab"), label: "Sopralluogo tecnico",   categoria: "cantiere" },

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
  { value: "clima",        label: "Clima",        emoji: "❄️" },
  { value: "residenziale", label: "Residenziale", emoji: "🏠" },
  { value: "cantiere",     label: "Cantiere",     emoji: "🏗️" },
  { value: "texture",      label: "Texture",      emoji: "🎨" },
  { value: "architettura", label: "Architettura", emoji: "🏙️" },
];
