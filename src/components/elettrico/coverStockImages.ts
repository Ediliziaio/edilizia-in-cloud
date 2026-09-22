/**
 * coverStockImages.ts (Elettrico) — Galleria immagini stock per cover PDF.
 *
 * Clone di src/components/serramenti/coverStockImages.ts. 18 immagini Unsplash
 * (licenza free, uso commerciale OK senza attribuzione — vedi
 * https://unsplash.com/license), suddivise in 5 categorie.
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
  categoria: "residenziale" | "cantiere" | "dettaglio" | "texture" | "architettura";
}

// Funzione helper per generare URL Unsplash con dimensioni controllate.
// `id` è la parte finale dell'URL canonico /photos/<id>.
const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // La copertina di serie, nostra (public/cover-stock/elettrico, 22/09/2026): la prima proposta.
  { id: "ele-eic-1", url: "/cover-stock/elettrico/1.jpg", thumb: "/cover-stock/elettrico/1-thumb.jpg", label: "Luci nuove al tramonto", categoria: "residenziale" },
  // ─── Residenziale (4) ────────────────────────────────────────────────
  { id: "res-1", ...ufy("1502672260266-1c1ef2d93688"), label: "Casa moderna",        categoria: "residenziale" },
  { id: "res-2", ...ufy("1568605114967-8130f3a36994"), label: "Villa contemporanea", categoria: "residenziale" },
  { id: "res-3", ...ufy("1564013799919-ab600027ffc6"), label: "Casa al tramonto",    categoria: "residenziale" },
  { id: "res-4", ...ufy("1600585154340-be6161a56a0c"), label: "Soggiorno luminoso",  categoria: "residenziale" },

  // ─── Cantiere (4) ────────────────────────────────────────────────────
  { id: "can-1", ...ufy("1503387762-cf4d2c5e4dca"),     label: "Cantiere impianto",    categoria: "cantiere" },
  { id: "can-2", ...ufy("1581094794329-c8112a89af12"),  label: "Quadro elettrico",     categoria: "cantiere" },
  { id: "can-3", ...ufy("1504307651254-35680f356dfd"),  label: "Operai al lavoro",     categoria: "cantiere" },
  { id: "can-4", ...ufy("1486406146926-c627a92ad1ab"),  label: "Sopralluogo tecnico",  categoria: "cantiere" },

  // ─── Dettaglio impianto (4) ──────────────────────────────────────────
  { id: "det-1", ...ufy("1565608438257-fac3c27beb36"),  label: "Cablaggio elettrico",  categoria: "dettaglio" },
  { id: "det-2", ...ufy("1558002038-1055907df827"),     label: "Quadro e differenziali", categoria: "dettaglio" },
  { id: "det-3", ...ufy("1581092160562-40aa08e78837"),  label: "Strumenti di misura",  categoria: "dettaglio" },
  { id: "det-4", ...ufy("1560448204-e02f11c3d0e2"),     label: "Presa e interruttore", categoria: "dettaglio" },

  // ─── Texture neutra (3) ──────────────────────────────────────────────
  { id: "tex-1", ...ufy("1557683316-973673baf926"),     label: "Pattern minimal blu",  categoria: "texture" },
  { id: "tex-2", ...ufy("1557683304-673a23048d34"),     label: "Gradient sobrio",      categoria: "texture" },
  { id: "tex-3", ...ufy("1558618666-fcd25c85cd64"),     label: "Texture geometrica",   categoria: "texture" },

  // ─── Architettura (3) ────────────────────────────────────────────────
  { id: "arc-1", ...ufy("1486325212027-8081e485255e"),  label: "Skyline urbano",       categoria: "architettura" },
  { id: "arc-2", ...ufy("1545324418-cc1a3fa10c00"),     label: "Facciata moderna",     categoria: "architettura" },
  { id: "arc-3", ...ufy("1487958449943-2429e8be8625"),  label: "Architettura pulita",  categoria: "architettura" },
];

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all",           label: "Tutte",        emoji: "✨" },
  { value: "residenziale",  label: "Residenziale", emoji: "🏠" },
  { value: "cantiere",      label: "Cantiere",     emoji: "🏗️" },
  { value: "dettaglio",     label: "Dettaglio",    emoji: "🔌" },
  { value: "texture",       label: "Texture",      emoji: "🎨" },
  { value: "architettura",  label: "Architettura", emoji: "🏙️" },
];
