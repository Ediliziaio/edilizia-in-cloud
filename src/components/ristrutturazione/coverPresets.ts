/**
 * coverPresets.ts — Preset layout cover PDF (modulo Ristrutturazione).
 *
 * Clone 1:1 di `src/components/serramenti/coverPresets.ts`, adattato al tema
 * ristrutturazione (solo i `sampleTitle`/descrizioni cambiano: i NOMI dei campi
 * `pdf_cover_*` restano identici a Serramenti per parità totale).
 *
 * I preset NON sono solo "stili di colore" ma combinazioni complete di LAYOUT:
 *  - Tipo: 'solid' (solo bg color) o 'photo' (con background image)
 *  - Posizione testo verticale: top | center | bottom
 *  - Allineamento testo: left | center
 *  - Stile overlay (per photo): flat | gradient | gradient_diag | vignette
 *  - Decorazione: square | circle | line | pattern | none
 *
 * Ogni preset applica in batch tutti questi campi su pdf_cover_*.
 *
 * NOTA tipi: `rst_template_pdf` non è nei types generati di Supabase e i campi
 * `pdf_cover_*` non sono sul tipo `RstTemplatePdf` (sono aggiunti via migration
 * `20271110070000_ristrutturazione_cover_parity.sql` e letti via cast nel PDF).
 * Per questo il patch è tipizzato su un'interfaccia locale `RstCoverPatch`
 * (le stesse chiavi/tipi del form cover dell'editor).
 */

export type CoverPresetCategory = "solid" | "photo";

/** Posizioni/stili supportati (union literal, allineati a Serramenti). */
export type RstCoverLogoPosition = "top_left" | "top_center" | "top_right" | "hidden";
export type RstCoverTextAlign = "left" | "center";
export type RstCoverTextVertical = "top" | "center" | "bottom";
export type RstCoverOverlayStyle = "flat" | "gradient" | "gradient_diag" | "vignette";
export type RstCoverDecorationStyle = "square" | "circle" | "line" | "pattern" | "none";

/**
 * Shape dei campi cover preset-driven (pdf_cover_*). Combacia con la slice cover
 * del FormState dell'editor: ogni chiave è il nome esatto della colonna DB.
 */
export interface RstCoverPatch {
  pdf_cover_bg_color: string | null;
  pdf_cover_image_url: string | null;
  pdf_cover_overlay_opacity: number | null;
  pdf_cover_overlay_style: RstCoverOverlayStyle;
  pdf_cover_text_color: string | null;
  pdf_cover_text_align: RstCoverTextAlign;
  pdf_cover_text_vertical: RstCoverTextVertical;
  pdf_cover_eyebrow_size: number | null;
  pdf_cover_title_size: number | null;
  pdf_cover_subtitle_size: number | null;
  pdf_cover_show_decoration: boolean;
  pdf_cover_decoration_style: RstCoverDecorationStyle;
  pdf_cover_show_client_card: boolean;
  pdf_cover_logo_position: RstCoverLogoPosition;
}

export type CoverPresetPatch = Partial<RstCoverPatch>;

export interface CoverPreset {
  id: string;
  nome: string;
  descrizione: string;
  emoji: string;
  /** Categoria: solo colore vs richiede immagine sfondo. */
  category: CoverPresetCategory;
  /** Tag breve sotto al nome (es. "Testo in alto", "Editorial"). */
  tag: string;
  /** Esempio titolo cover mostrato nella mini-anteprima della card. */
  sampleTitle: string;
  /** Colori per la mini-preview della card (non sono i valori applicati,
   *  sono solo per render della thumbnail). */
  swatchBg: string;
  swatchText: string;
  swatchAccent: string;
  /** Campi del template DA applicare in batch al click. */
  patch: CoverPresetPatch;
}

// URL di una stock image usata come "suggested image" per i preset photo
// che non hanno una propria foto specifica (l'utente la cambierà poi).
const STOCK_FALLBACK_HOUSE =
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=80&auto=format&fit=crop";

export const COVER_PRESETS: CoverPreset[] = [
  // ═══ SOLID — Solo colore di sfondo, no immagine ════════════════════════
  {
    id: "solid_minimal_top",
    nome: "Minimal · testo in alto",
    descrizione: "Sfondo bianco pulito, titolo grosso in alto, niente distrazioni",
    emoji: "⚪",
    category: "solid",
    tag: "Top · B2B",
    sampleTitle: "Preventivo\nristrutturazione.",
    swatchBg: "#FFFFFF",
    swatchText: "#0F172A",
    swatchAccent: "#64748B",
    patch: {
      pdf_cover_bg_color: "#FFFFFF",
      pdf_cover_image_url: null,
      pdf_cover_text_color: "#0F172A",
      pdf_cover_text_align: "left",
      pdf_cover_text_vertical: "top",
      pdf_cover_eyebrow_size: 10,
      pdf_cover_title_size: 48,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: false,
      pdf_cover_decoration_style: "line",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
      pdf_cover_overlay_style: "flat",
      pdf_cover_logo_position: "top_left",
    },
  },
  {
    id: "solid_premium_center",
    nome: "Premium · testo al centro",
    descrizione: "Dark teal con ornamenti, titolo centrato perfetto",
    emoji: "💎",
    category: "solid",
    tag: "Center · Premium",
    sampleTitle: "Casa nuova,\nchiavi in mano.",
    swatchBg: "#0F2A2E",
    swatchText: "#F5F5F4",
    swatchAccent: "#D4A574",
    patch: {
      pdf_cover_bg_color: "#0F2A2E",
      pdf_cover_image_url: null,
      pdf_cover_text_color: "#F5F5F4",
      pdf_cover_text_align: "center",
      pdf_cover_text_vertical: "center",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 46,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: true,
      pdf_cover_decoration_style: "circle",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
      pdf_cover_overlay_style: "flat",
      pdf_cover_logo_position: "top_center",
    },
  },
  {
    id: "solid_bold_bottom",
    nome: "Bold Nero · testo in basso",
    descrizione: "Nero pieno, titolo enorme in basso, drama puro",
    emoji: "⚫",
    category: "solid",
    tag: "Bottom · Lusso",
    sampleTitle: "La tua casa,\nrinnovata.",
    swatchBg: "#0A0A0A",
    swatchText: "#FFFFFF",
    swatchAccent: "#F59E0B",
    patch: {
      pdf_cover_bg_color: "#0A0A0A",
      pdf_cover_image_url: null,
      pdf_cover_text_color: "#FFFFFF",
      pdf_cover_text_align: "left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 56,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: true,
      pdf_cover_decoration_style: "square",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
      pdf_cover_overlay_style: "flat",
      pdf_cover_logo_position: "top_left",
    },
  },
  {
    id: "solid_warm_bottom",
    nome: "Casa Calda · testo in basso",
    descrizione: "Marrone caldo + accent crema, tono familiare residenziale",
    emoji: "🏡",
    category: "solid",
    tag: "Bottom · Residenziale",
    sampleTitle: "Casa,\ndolce casa.",
    swatchBg: "#7C2D12",
    swatchText: "#FEF3C7",
    swatchAccent: "#FBBF24",
    patch: {
      pdf_cover_bg_color: "#7C2D12",
      pdf_cover_image_url: null,
      pdf_cover_text_color: "#FEF3C7",
      pdf_cover_text_align: "left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 46,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: true,
      pdf_cover_decoration_style: "pattern",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
      pdf_cover_overlay_style: "flat",
      pdf_cover_logo_position: "top_left",
    },
  },
  // ═══ PHOTO — Background immagine + overlay + testo ═════════════════════
  {
    id: "photo_editorial_top",
    nome: "Editoriale · testo in alto",
    descrizione: "Foto con overlay dal basso, titolo in alto",
    emoji: "📸",
    category: "photo",
    tag: "Top · Con foto",
    sampleTitle: "Il tuo\nprogetto.",
    swatchBg: "#1C1917",
    swatchText: "#FAFAF9",
    swatchAccent: "#F59E0B",
    patch: {
      pdf_cover_bg_color: "#1C1917",
      pdf_cover_image_url: STOCK_FALLBACK_HOUSE,
      pdf_cover_text_color: "#FAFAF9",
      pdf_cover_text_align: "left",
      pdf_cover_text_vertical: "top",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 48,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: false,
      pdf_cover_decoration_style: "none",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 50,
      pdf_cover_overlay_style: "gradient",
      pdf_cover_logo_position: "top_right",
    },
  },
  {
    id: "photo_hero_center",
    nome: "Hero Photo · testo al centro",
    descrizione: "Foto fullscreen, titolone gigante centrato",
    emoji: "🎯",
    category: "photo",
    tag: "Center · Hero",
    sampleTitle: "La tua\nnuova casa.",
    swatchBg: "#0F172A",
    swatchText: "#FFFFFF",
    swatchAccent: "#FBBF24",
    patch: {
      pdf_cover_bg_color: "#0F172A",
      pdf_cover_image_url: STOCK_FALLBACK_HOUSE,
      pdf_cover_text_color: "#FFFFFF",
      pdf_cover_text_align: "center",
      pdf_cover_text_vertical: "center",
      pdf_cover_eyebrow_size: 12,
      pdf_cover_title_size: 60,
      pdf_cover_subtitle_size: 15,
      pdf_cover_show_decoration: false,
      pdf_cover_decoration_style: "none",
      pdf_cover_show_client_card: false,
      pdf_cover_overlay_opacity: 55,
      pdf_cover_overlay_style: "vignette",
      pdf_cover_logo_position: "top_center",
    },
  },
  {
    id: "photo_magazine_bottom",
    nome: "Magazine · testo in basso",
    descrizione: "Foto sfondo + overlay gradient + titolo editoriale in basso",
    emoji: "📰",
    category: "photo",
    tag: "Bottom · Editorial",
    sampleTitle: "Comfort\nche si vede.",
    swatchBg: "#27272A",
    swatchText: "#FAFAFA",
    swatchAccent: "#FFFFFF",
    patch: {
      pdf_cover_bg_color: "#27272A",
      pdf_cover_image_url: STOCK_FALLBACK_HOUSE,
      pdf_cover_text_color: "#FAFAFA",
      pdf_cover_text_align: "left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 48,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: true,
      pdf_cover_decoration_style: "line",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 65,
      pdf_cover_overlay_style: "gradient",
      pdf_cover_logo_position: "top_left",
    },
  },
  {
    id: "photo_marine_bottom",
    nome: "Marine Photo · diagonale",
    descrizione: "Foto sfondo + gradient diagonale blu, look tech moderno",
    emoji: "🌊",
    category: "photo",
    tag: "Bottom · Tech",
    sampleTitle: "Innovazione\nin ogni dettaglio.",
    swatchBg: "#0C2340",
    swatchText: "#F0F9FF",
    swatchAccent: "#60A5FA",
    patch: {
      pdf_cover_bg_color: "#0C2340",
      pdf_cover_image_url: STOCK_FALLBACK_HOUSE,
      pdf_cover_text_color: "#F0F9FF",
      pdf_cover_text_align: "left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 46,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: true,
      pdf_cover_decoration_style: "pattern",
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 55,
      pdf_cover_overlay_style: "gradient_diag",
      pdf_cover_logo_position: "top_right",
    },
  },
];

/**
 * Detection del preset attivo basato sui campi del form.
 * Confronta TUTTI i campi della patch — se uno solo differisce, no match.
 * Restituisce null se l'utente ha customizzato fuori dai preset.
 *
 * NOTA: per i preset 'photo', non confrontiamo `pdf_cover_image_url` perché
 * l'utente potrebbe aver caricato una sua immagine (e va benissimo, il
 * preset comunque "funziona" come layout).
 */
export function detectActiveCoverPreset(
  form: Partial<RstCoverPatch>,
): string | null {
  for (const preset of COVER_PRESETS) {
    const patch = preset.patch;
    const allMatch = (Object.keys(patch) as (keyof CoverPresetPatch)[]).every((k) => {
      // Per preset photo, skippiamo image_url (vedi commento sopra).
      if (preset.category === "photo" && k === "pdf_cover_image_url") return true;
      const expected = patch[k];
      const actual = form[k];
      if (expected == null && actual == null) return true;
      return expected === actual;
    });
    if (allMatch) return preset.id;
  }
  return null;
}

// ─── Galleria immagini stock per cover PDF ─────────────────────────────────────
// Clone di `src/components/serramenti/coverStockImages.ts` (inline qui per non
// introdurre file extra fuori scope). Immagini Unsplash (licenza free, uso
// commerciale OK). URL full a w=1600 q=80; thumb a w=300 (più leggera). react-pdf
// scarica l'immagine alla generazione del PDF (setta pdf_cover_image_url).
export interface CoverStockImage {
  id: string;
  url: string;
  thumb: string;
  label: string;
  categoria: "residenziale" | "cantiere" | "dettaglio" | "texture" | "architettura";
}

const ufy = (id: string) => ({
  url: `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`,
  thumb: `https://images.unsplash.com/photo-${id}?w=300&q=70&auto=format&fit=crop`,
});

export const COVER_STOCK_IMAGES: CoverStockImage[] = [
  // ─── Residenziale ────────────────────────────────────────────────────
  { id: "res-1", ...ufy("1502672260266-1c1ef2d93688"), label: "Casa moderna",        categoria: "residenziale" },
  { id: "res-2", ...ufy("1568605114967-8130f3a36994"), label: "Villa contemporanea", categoria: "residenziale" },
  { id: "res-3", ...ufy("1564013799919-ab600027ffc6"), label: "Casa al tramonto",    categoria: "residenziale" },
  { id: "res-4", ...ufy("1600585154340-be6161a56a0c"), label: "Soggiorno luminoso",  categoria: "residenziale" },

  // ─── Cantiere ────────────────────────────────────────────────────────
  { id: "can-1", ...ufy("1503387762-cf4d2c5e4dca"),     label: "Cantiere ristrutturazione", categoria: "cantiere" },
  { id: "can-2", ...ufy("1581094794329-c8112a89af12"),  label: "Lavori in corso",      categoria: "cantiere" },
  { id: "can-3", ...ufy("1504307651254-35680f356dfd"),  label: "Operai al lavoro",     categoria: "cantiere" },
  { id: "can-4", ...ufy("1486406146926-c627a92ad1ab"),  label: "Sopralluogo tecnico",  categoria: "cantiere" },

  // ─── Dettaglio interni ───────────────────────────────────────────────
  { id: "det-1", ...ufy("1493663284031-b7e3aefcae8e"),  label: "Interno rinnovato",    categoria: "dettaglio" },
  { id: "det-2", ...ufy("1517022812141-23620dba5c23"),  label: "Cucina moderna",       categoria: "dettaglio" },
  { id: "det-3", ...ufy("1565182999561-18d7dc61c393"),  label: "Bagno di design",      categoria: "dettaglio" },
  { id: "det-4", ...ufy("1560448204-e02f11c3d0e2"),     label: "Pavimento posato",     categoria: "dettaglio" },

  // ─── Texture neutra ──────────────────────────────────────────────────
  { id: "tex-1", ...ufy("1557683316-973673baf926"),     label: "Pattern minimal blu",  categoria: "texture" },
  { id: "tex-2", ...ufy("1557683304-673a23048d34"),     label: "Gradient sobrio",      categoria: "texture" },
  { id: "tex-3", ...ufy("1558618666-fcd25c85cd64"),     label: "Texture geometrica",   categoria: "texture" },

  // ─── Architettura ────────────────────────────────────────────────────
  { id: "arc-1", ...ufy("1486325212027-8081e485255e"),  label: "Skyline urbano",       categoria: "architettura" },
  { id: "arc-2", ...ufy("1545324418-cc1a3fa10c00"),     label: "Facciata moderna",     categoria: "architettura" },
  { id: "arc-3", ...ufy("1487958449943-2429e8be8625"),  label: "Architettura pulita",  categoria: "architettura" },
];

export const COVER_STOCK_CATEGORIE: Array<{ value: CoverStockImage["categoria"] | "all"; label: string; emoji: string }> = [
  { value: "all",           label: "Tutte",        emoji: "✨" },
  { value: "residenziale",  label: "Residenziale", emoji: "🏠" },
  { value: "cantiere",      label: "Cantiere",     emoji: "🏗️" },
  { value: "dettaglio",     label: "Dettaglio",    emoji: "🛋️" },
  { value: "texture",       label: "Texture",      emoji: "🎨" },
  { value: "architettura",  label: "Architettura", emoji: "🏙️" },
];
