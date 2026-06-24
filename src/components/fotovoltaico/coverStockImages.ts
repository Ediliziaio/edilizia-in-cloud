/**
 * coverStockImages.ts (Fotovoltaico) — Galleria immagini stock per la cover PDF.
 * Parità col modulo Serramenti, ma curata per il fotovoltaico (case, impianti,
 * texture; niente immagini di infissi). Tutte Unsplash, libere per uso
 * commerciale. URL full (1600px) per il PDF, thumb (300px) per la grid editor.
 */

export interface CoverStockImage {
  id: string;
  /** URL piena (sfondo cover PDF). */
  url: string;
  /** URL thumbnail (grid editor). */
  thumb: string;
  /** Etichetta breve mostrata in hover. */
  label: string;
  categoria: "residenziale" | "impianto" | "texture";
}

const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // Impianti / solare
  { id: "imp-1", ...ufy("1509391366360-2e959784a276"), label: "Pannelli solari",     categoria: "impianto" },
  { id: "imp-2", ...ufy("1504307651254-35680f356dfd"), label: "Operai al lavoro",    categoria: "impianto" },
  { id: "imp-3", ...ufy("1486406146926-c627a92ad1ab"), label: "Sopralluogo tecnico", categoria: "impianto" },
  // Residenziale
  { id: "res-1", ...ufy("1502672260266-1c1ef2d93688"), label: "Casa moderna",        categoria: "residenziale" },
  { id: "res-2", ...ufy("1568605114967-8130f3a36994"), label: "Villa contemporanea", categoria: "residenziale" },
  { id: "res-3", ...ufy("1564013799919-ab600027ffc6"), label: "Casa al tramonto",    categoria: "residenziale" },
  { id: "res-4", ...ufy("1600585154340-be6161a56a0c"), label: "Soggiorno luminoso",  categoria: "residenziale" },
  // Texture / sfondi
  { id: "tex-1", ...ufy("1557683316-973673baf926"),    label: "Pattern minimal blu", categoria: "texture" },
  { id: "tex-2", ...ufy("1557683304-673a23048d34"),    label: "Gradient sobrio",     categoria: "texture" },
  { id: "tex-3", ...ufy("1558618666-fcd25c85cd64"),    label: "Texture geometrica",  categoria: "texture" },
];

export const COVER_STOCK_CATEGORIE: { value: CoverStockImage["categoria"] | "all"; emoji: string; label: string }[] = [
  { value: "all",          emoji: "🖼️", label: "Tutte" },
  { value: "impianto",     emoji: "☀️", label: "Impianti" },
  { value: "residenziale", emoji: "🏠", label: "Case" },
  { value: "texture",      emoji: "🎨", label: "Texture" },
];
