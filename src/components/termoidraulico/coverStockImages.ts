/**
 * coverStockImages.ts — Galleria immagini stock per cover PDF (modulo Termoidraulico).
 *
 * Clone strutturale di `src/components/bagni/coverStockImages.ts`, con soggetti a
 * tema termoidraulico/impianti (caldaie, riscaldamento, pompe di calore, cantiere
 * impiantistico). Tutte da Unsplash (licenza free, uso commerciale OK senza
 * attribuzione obbligatoria — vedi https://unsplash.com/license).
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
  categoria: "impianto" | "cantiere" | "dettaglio" | "texture" | "architettura";
}

// Funzione helper per generare URL Unsplash con dimensioni controllate.
// `id` è la parte finale dell'URL canonico /photos/<id>.
const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // La copertina di serie, nostra (public/cover-stock/termoidraulico, 22/09/2026): la prima proposta.
  { id: "idr-eic-1", url: "/cover-stock/termoidraulico/1.jpg", thumb: "/cover-stock/termoidraulico/1-thumb.jpg", label: "Casa calda d'inverno", categoria: "impianto" },
  // ─── Impianto (4) ────────────────────────────────────────────────────
  { id: "imp-1", ...ufy("1581094794329-c8112a89af12"), label: "Sala impianti",          categoria: "impianto" },
  { id: "imp-2", ...ufy("1558618666-fcd25c85cd64"),    label: "Pompa di calore",        categoria: "impianto" },
  { id: "imp-3", ...ufy("1635048424329-a9bfb146d7aa"), label: "Caldaia a parete",       categoria: "impianto" },
  { id: "imp-4", ...ufy("1599719500956-d158a3abd461"), label: "Termosifone moderno",    categoria: "impianto" },

  // ─── Cantiere (4) ────────────────────────────────────────────────────
  { id: "can-1", ...ufy("1504307651254-35680f356dfd"), label: "Operai al lavoro",       categoria: "cantiere" },
  { id: "can-2", ...ufy("1503387762-cf4d2c5e4dca"),    label: "Posa tubazioni",         categoria: "cantiere" },
  { id: "can-3", ...ufy("1486406146926-c627a92ad1ab"), label: "Sopralluogo tecnico",    categoria: "cantiere" },
  { id: "can-4", ...ufy("1621905251189-08b45d6a269e"), label: "Cantiere impianti",      categoria: "cantiere" },

  // ─── Dettaglio (4) ───────────────────────────────────────────────────
  { id: "det-1", ...ufy("1564540583246-934409427776"), label: "Rubinetteria moderna",   categoria: "dettaglio" },
  { id: "det-2", ...ufy("1607400201889-565b1ee75f8e"), label: "Valvole e manometri",    categoria: "dettaglio" },
  { id: "det-3", ...ufy("1581092160562-40aa08e78837"), label: "Collettore idraulico",   categoria: "dettaglio" },
  { id: "det-4", ...ufy("1581092918056-0c4c3acd3789"), label: "Strumenti di misura",    categoria: "dettaglio" },

  // ─── Texture neutra (3) ──────────────────────────────────────────────
  { id: "tex-1", ...ufy("1557683316-973673baf926"),    label: "Pattern minimal blu",    categoria: "texture" },
  { id: "tex-2", ...ufy("1557683304-673a23048d34"),    label: "Gradient sobrio",        categoria: "texture" },
  { id: "tex-3", ...ufy("1550859492-d5da9d8e45f3"),    label: "Texture geometrica",     categoria: "texture" },

  // ─── Architettura (3) ────────────────────────────────────────────────
  { id: "arc-1", ...ufy("1486325212027-8081e485255e"), label: "Skyline urbano",         categoria: "architettura" },
  { id: "arc-2", ...ufy("1545324418-cc1a3fa10c00"),    label: "Facciata moderna",       categoria: "architettura" },
  { id: "arc-3", ...ufy("1487958449943-2429e8be8625"), label: "Architettura pulita",    categoria: "architettura" },
];

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all",          label: "Tutte",        emoji: "✨" },
  { value: "impianto",     label: "Impianto",     emoji: "🔧" },
  { value: "cantiere",     label: "Cantiere",     emoji: "🏗️" },
  { value: "dettaglio",    label: "Dettaglio",    emoji: "🔩" },
  { value: "texture",      label: "Texture",      emoji: "🎨" },
  { value: "architettura", label: "Architettura", emoji: "🏙️" },
];
