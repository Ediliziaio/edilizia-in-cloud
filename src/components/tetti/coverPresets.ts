import { detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";
/**
 * coverPresets.ts — Preset layout cover PDF del modulo Tetti.
 *
 * Clone strutturale di `src/components/serramenti/coverPresets.ts`, adattato allo
 * schema `cover_*` di `tet_template_pdf` (il modulo tetti usa `cover_*` invece di
 * `pdf_cover_*` come Serramenti). I sampleTitle sono a tema copertura/tetto.
 *
 * I preset NON sono solo "stili di colore" ma combinazioni complete di LAYOUT:
 *  - Tipo: 'solid' (solo bg color) o 'photo' (con background image)
 *  - Posizione testo verticale: top | center | bottom
 *  - Allineamento testo: left | center
 *  - Stile overlay (per photo): flat | gradient | gradient_diag | vignette
 *  - Decorazione: square | circle | line | pattern | none
 *
 * Ogni preset applica in batch tutti questi campi su cover_*.
 *
 * Per i preset 'photo': se l'utente non ha già caricato un'immagine, il preset
 * imposta `cover_image_url` con una stock image suggerita (l'utente la cambierà poi).
 */

import type { TetTemplatePdf } from "@/types/tetti";

export type CoverPresetCategory = "solid" | "photo";

export type CoverPresetPatch = Partial<Pick<TetTemplatePdf,
  | "cover_bg_color"
  | "cover_image_url"
  | "cover_overlay_opacity"
  | "cover_overlay_style"
  | "cover_text_color"
  | "cover_text_align"
  | "cover_text_vertical"
  | "cover_eyebrow_size"
  | "cover_title_size"
  | "cover_subtitle_size"
  | "cover_show_decoration"
  | "cover_decoration_style"
  | "cover_show_client_card"
  | "cover_logo_position"
>>;

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

// URL di una stock image (tetto/copertura) usata come "suggested image" per i
// preset photo che non hanno una propria foto specifica (l'utente la cambierà poi).
const STOCK_FALLBACK_ROOF = "/cover-stock/tetti/1.jpg";

export const COVER_PRESETS: CoverPreset[] = [
  // ═══ SOLID — Solo colore di sfondo, no immagine ════════════════════════
  {
    id: "solid_minimal_top",
    nome: "Minimal · testo in alto",
    descrizione: "Sfondo bianco pulito, titolo grosso in alto, niente distrazioni",
    emoji: "⚪",
    category: "solid",
    tag: "Top · B2B",
    sampleTitle: "Preventivo\ntetto.",
    swatchBg: "#FFFFFF",
    swatchText: "#0F172A",
    swatchAccent: "#64748B",
    patch: {
      cover_bg_color: "#FFFFFF",
      cover_image_url: null,
      cover_text_color: "#0F172A",
      cover_text_align: "left",
      cover_text_vertical: "top",
      cover_eyebrow_size: 10,
      cover_title_size: 40,
      cover_subtitle_size: 13,
      cover_show_decoration: false,
      cover_decoration_style: "line",
      cover_show_client_card: true,
      cover_overlay_opacity: 0,
      cover_overlay_style: "flat",
      cover_logo_position: "top_left",
    },
  },
  {
    id: "solid_premium_center",
    nome: "Premium · testo al centro",
    descrizione: "Dark teal con ornamenti, titolo centrato perfetto",
    emoji: "💎",
    category: "solid",
    tag: "Center · Premium",
    sampleTitle: "Coperture\nche durano.",
    swatchBg: "#0F2A2E",
    swatchText: "#F5F5F4",
    swatchAccent: "#D4A574",
    patch: {
      cover_bg_color: "#0F2A2E",
      cover_image_url: null,
      cover_text_color: "#F5F5F4",
      cover_text_align: "center",
      cover_text_vertical: "center",
      cover_eyebrow_size: 11,
      cover_title_size: 38,
      cover_subtitle_size: 13,
      cover_show_decoration: true,
      cover_decoration_style: "circle",
      cover_show_client_card: true,
      cover_overlay_opacity: 0,
      cover_overlay_style: "flat",
      cover_logo_position: "top_center",
    },
  },
  {
    id: "solid_bold_bottom",
    nome: "Bold Nero · testo in basso",
    descrizione: "Nero pieno, titolo enorme in basso, drama puro",
    emoji: "⚫",
    category: "solid",
    tag: "Bottom · Lusso",
    sampleTitle: "Il tuo tetto,\nnuova generazione.",
    swatchBg: "#0A0A0A",
    swatchText: "#FFFFFF",
    swatchAccent: "#F59E0B",
    patch: {
      cover_bg_color: "#0A0A0A",
      cover_image_url: null,
      cover_text_color: "#FFFFFF",
      cover_text_align: "left",
      cover_text_vertical: "bottom",
      cover_eyebrow_size: 11,
      cover_title_size: 44,
      cover_subtitle_size: 14,
      cover_show_decoration: true,
      cover_decoration_style: "square",
      cover_show_client_card: true,
      cover_overlay_opacity: 0,
      cover_overlay_style: "flat",
      cover_logo_position: "top_left",
    },
  },
  {
    id: "solid_warm_bottom",
    nome: "Casa Calda · testo in basso",
    descrizione: "Marrone caldo + accent crema, tono familiare residenziale",
    emoji: "🏡",
    category: "solid",
    tag: "Bottom · Residenziale",
    sampleTitle: "Casa,\nal sicuro dall'alto.",
    swatchBg: "#7C2D12",
    swatchText: "#FEF3C7",
    swatchAccent: "#FBBF24",
    patch: {
      cover_bg_color: "#7C2D12",
      cover_image_url: null,
      cover_text_color: "#FEF3C7",
      cover_text_align: "left",
      cover_text_vertical: "bottom",
      cover_eyebrow_size: 11,
      cover_title_size: 38,
      cover_subtitle_size: 14,
      cover_show_decoration: true,
      cover_decoration_style: "pattern",
      cover_show_client_card: true,
      cover_overlay_opacity: 0,
      cover_overlay_style: "flat",
      cover_logo_position: "top_left",
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
      cover_bg_color: "#1C1917",
      cover_image_url: STOCK_FALLBACK_ROOF,
      cover_text_color: "#FAFAF9",
      cover_text_align: "left",
      cover_text_vertical: "top",
      cover_eyebrow_size: 11,
      cover_title_size: 40,
      cover_subtitle_size: 14,
      cover_show_decoration: false,
      cover_decoration_style: "none",
      cover_show_client_card: true,
      cover_overlay_opacity: 0.5,
      cover_overlay_style: "gradient",
      cover_logo_position: "top_right",
    },
  },
  {
    id: "photo_hero_center",
    nome: "Hero Photo · testo al centro",
    descrizione: "Foto fullscreen, titolone gigante centrato",
    emoji: "🎯",
    category: "photo",
    tag: "Center · Hero",
    sampleTitle: "La tua\nnuova copertura.",
    swatchBg: "#0F172A",
    swatchText: "#FFFFFF",
    swatchAccent: "#FBBF24",
    patch: {
      cover_bg_color: "#0F172A",
      cover_image_url: STOCK_FALLBACK_ROOF,
      cover_text_color: "#FFFFFF",
      cover_text_align: "center",
      cover_text_vertical: "center",
      cover_eyebrow_size: 12,
      cover_title_size: 44,
      cover_subtitle_size: 15,
      cover_show_decoration: false,
      cover_decoration_style: "none",
      cover_show_client_card: false,
      cover_overlay_opacity: 0.55,
      cover_overlay_style: "vignette",
      cover_logo_position: "top_center",
    },
  },
  {
    id: "photo_magazine_bottom",
    nome: "Magazine · testo in basso",
    descrizione: "Foto sfondo + overlay gradient + titolo editoriale in basso",
    emoji: "📰",
    category: "photo",
    tag: "Bottom · Editorial",
    sampleTitle: "Protezione\nche si vede.",
    swatchBg: "#27272A",
    swatchText: "#FAFAFA",
    swatchAccent: "#FFFFFF",
    patch: {
      cover_bg_color: "#27272A",
      cover_image_url: STOCK_FALLBACK_ROOF,
      cover_text_color: "#FAFAFA",
      cover_text_align: "left",
      cover_text_vertical: "bottom",
      cover_eyebrow_size: 11,
      cover_title_size: 40,
      cover_subtitle_size: 14,
      cover_show_decoration: true,
      cover_decoration_style: "line",
      cover_show_client_card: true,
      cover_overlay_opacity: 0.65,
      cover_overlay_style: "gradient",
      cover_logo_position: "top_left",
    },
  },
  {
    id: "photo_marine_bottom",
    nome: "Marine Photo · diagonale",
    descrizione: "Foto sfondo + gradient diagonale blu, look tech moderno",
    emoji: "🌊",
    category: "photo",
    tag: "Bottom · Tech",
    sampleTitle: "Innovazione\nin ogni falda.",
    swatchBg: "#0C2340",
    swatchText: "#F0F9FF",
    swatchAccent: "#60A5FA",
    patch: {
      cover_bg_color: "#0C2340",
      cover_image_url: STOCK_FALLBACK_ROOF,
      cover_text_color: "#F0F9FF",
      cover_text_align: "left",
      cover_text_vertical: "bottom",
      cover_eyebrow_size: 11,
      cover_title_size: 38,
      cover_subtitle_size: 13,
      cover_show_decoration: true,
      cover_decoration_style: "pattern",
      cover_show_client_card: true,
      cover_overlay_opacity: 0.55,
      cover_overlay_style: "gradient_diag",
      cover_logo_position: "top_right",
    },
  },
];

/**
 * Detection del preset attivo basato sui campi del form.
 * Confronta TUTTI i campi della patch — se uno solo differisce, no match.
 * Restituisce null se l'utente ha customizzato fuori dai preset.
 *
 * NOTA: per i preset 'photo', non confrontiamo `cover_image_url` perché
 * l'utente potrebbe aver caricato una sua immagine (e va benissimo, il
 * preset comunque "funziona" come layout).
 */
export function detectActiveCoverPreset(
  form: Partial<TetTemplatePdf>,
): string | null { return detectCoverStyle(form, COVER_PRESETS); }
