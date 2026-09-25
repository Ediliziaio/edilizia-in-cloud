import { detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";
/**
 * coverPresets.ts — Preset layout cover PDF (modulo Piscine).
 *
 * Clone fedele di src/components/serramenti/coverPresets.ts, adattato al modulo
 * Piscine. I preset NON sono solo "stili di colore" ma combinazioni complete di
 * LAYOUT che includono:
 *  - Tipo: 'solid' (solo bg color) o 'photo' (con background image)
 *  - Posizione testo verticale: top | center | bottom
 *  - Allineamento testo: left | center
 *  - Stile overlay (per photo): flat | gradient | gradient_diag | vignette
 *  - Decorazione: square | circle | line | pattern | none
 *
 * Ogni preset applica in batch tutti questi campi. Le colonne sono quelle del
 * modulo Piscine: bg/immagine/colore-testo/opacità/allineamento/dimensione-
 * titolo/posizione-logo vivono già su `cover_*`; verticale/overlay-style/
 * decorazione/card-cliente/dimensioni eyebrow+sottotitolo sono i nuovi
 * `pdf_cover_*` (parity con Serramenti, vedi migration 20271110060000).
 *
 * Per i preset 'photo': se l'utente non ha già caricato un'immagine, viene
 * suggerito di caricarla via galleria stock o file upload. Il preset imposta
 * `cover_image_url` SOLO quando è esplicitamente fornita (stock image).
 */

import type { PisTemplatePdf } from "@/types/piscine";

export type CoverPresetCategory = "solid" | "photo";

export type CoverPresetPatch = Partial<Pick<PisTemplatePdf,
  | "cover_image_url"
  | "cover_overlay_opacity"
  | "cover_text_color"
  | "cover_text_align"
  | "cover_title_size"
  | "cover_logo_position"
  | "pdf_cover_overlay_style"
  | "pdf_cover_text_vertical"
  | "pdf_cover_decoration_style"
  | "pdf_cover_show_decoration"
  | "pdf_cover_show_client_card"
  | "pdf_cover_eyebrow_size"
  | "pdf_cover_subtitle_size"
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

// URL di una stock image usata come "suggested image" per i preset photo
// che non hanno una propria foto specifica (l'utente la cambierà poi).
// Tema acqua/piscina per coerenza col modulo.
const STOCK_FALLBACK_POOL = "/cover-stock/piscine/1.jpg";

export const COVER_PRESETS: CoverPreset[] = [
  // ═══ SOLID — Solo colore di sfondo, no immagine ════════════════════════
  {
    id: "solid_minimal_top",
    nome: "Minimal · testo in alto",
    descrizione: "Sfondo bianco pulito, titolo grosso in alto, niente distrazioni",
    emoji: "⚪",
    category: "solid",
    tag: "Top · B2B",
    sampleTitle: "Proposta\npersonalizzata.",
    swatchBg: "#FFFFFF",
    swatchText: "#0F172A",
    swatchAccent: "#0EA5E9",
    patch: {
      cover_image_url: null,
      cover_text_color: "#0F172A",
      cover_text_align: "left",
      cover_title_size: 40,
      cover_overlay_opacity: 0,
      cover_logo_position: "top_left",
      pdf_cover_text_vertical: "top",
      pdf_cover_overlay_style: "flat",
      pdf_cover_decoration_style: "line",
      pdf_cover_show_decoration: false,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 10,
      pdf_cover_subtitle_size: 13,
    },
  },
  {
    id: "solid_premium_center",
    nome: "Premium · testo al centro",
    descrizione: "Dark teal con ornamenti, titolo centrato perfetto",
    emoji: "💎",
    category: "solid",
    tag: "Center · Premium",
    sampleTitle: "Eleganza\nche dura.",
    swatchBg: "#0F2A2E",
    swatchText: "#F5F5F4",
    swatchAccent: "#38BDF8",
    patch: {
      cover_image_url: null,
      cover_text_color: "#F5F5F4",
      cover_text_align: "center",
      cover_title_size: 38,
      cover_overlay_opacity: 0,
      cover_logo_position: "top_center",
      pdf_cover_text_vertical: "center",
      pdf_cover_overlay_style: "flat",
      pdf_cover_decoration_style: "circle",
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 11,
      pdf_cover_subtitle_size: 13,
    },
  },
  {
    id: "solid_bold_bottom",
    nome: "Bold Nero · testo in basso",
    descrizione: "Nero pieno, titolo enorme in basso, drama puro",
    emoji: "⚫",
    category: "solid",
    tag: "Bottom · Lusso",
    sampleTitle: "La tua piscina,\nnuova generazione.",
    swatchBg: "#0A0A0A",
    swatchText: "#FFFFFF",
    swatchAccent: "#0EA5E9",
    patch: {
      cover_image_url: null,
      cover_text_color: "#FFFFFF",
      cover_text_align: "left",
      cover_title_size: 44,
      cover_overlay_opacity: 0,
      cover_logo_position: "top_left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_overlay_style: "flat",
      pdf_cover_decoration_style: "square",
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 11,
      pdf_cover_subtitle_size: 14,
    },
  },
  {
    id: "solid_warm_bottom",
    nome: "Acqua Calda · testo in basso",
    descrizione: "Blu profondo + accent ciano, tono relax residenziale",
    emoji: "🌴",
    category: "solid",
    tag: "Bottom · Residenziale",
    sampleTitle: "Relax,\na casa tua.",
    swatchBg: "#0C4A6E",
    swatchText: "#E0F2FE",
    swatchAccent: "#38BDF8",
    patch: {
      cover_image_url: null,
      cover_text_color: "#E0F2FE",
      cover_text_align: "left",
      cover_title_size: 38,
      cover_overlay_opacity: 0,
      cover_logo_position: "top_left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_overlay_style: "flat",
      pdf_cover_decoration_style: "pattern",
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 11,
      pdf_cover_subtitle_size: 14,
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
    swatchAccent: "#38BDF8",
    patch: {
      cover_image_url: STOCK_FALLBACK_POOL,
      cover_text_color: "#FAFAF9",
      cover_text_align: "left",
      cover_title_size: 40,
      cover_overlay_opacity: 0.5,
      cover_logo_position: "top_right",
      pdf_cover_text_vertical: "top",
      pdf_cover_overlay_style: "gradient",
      pdf_cover_decoration_style: "none",
      pdf_cover_show_decoration: false,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 11,
      pdf_cover_subtitle_size: 14,
    },
  },
  {
    id: "photo_hero_center",
    nome: "Hero Photo · testo al centro",
    descrizione: "Foto fullscreen, titolone gigante centrato",
    emoji: "🎯",
    category: "photo",
    tag: "Center · Hero",
    sampleTitle: "La tua\nnuova piscina.",
    swatchBg: "#0F172A",
    swatchText: "#FFFFFF",
    swatchAccent: "#38BDF8",
    patch: {
      cover_image_url: STOCK_FALLBACK_POOL,
      cover_text_color: "#FFFFFF",
      cover_text_align: "center",
      cover_title_size: 44,
      cover_overlay_opacity: 0.55,
      cover_logo_position: "top_center",
      pdf_cover_text_vertical: "center",
      pdf_cover_overlay_style: "vignette",
      pdf_cover_decoration_style: "none",
      pdf_cover_show_decoration: false,
      pdf_cover_show_client_card: false,
      pdf_cover_eyebrow_size: 12,
      pdf_cover_subtitle_size: 15,
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
      cover_image_url: STOCK_FALLBACK_POOL,
      cover_text_color: "#FAFAFA",
      cover_text_align: "left",
      cover_title_size: 40,
      cover_overlay_opacity: 0.65,
      cover_logo_position: "top_left",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_overlay_style: "gradient",
      pdf_cover_decoration_style: "line",
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 11,
      pdf_cover_subtitle_size: 14,
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
      cover_image_url: STOCK_FALLBACK_POOL,
      cover_text_color: "#F0F9FF",
      cover_text_align: "left",
      cover_title_size: 38,
      cover_overlay_opacity: 0.55,
      cover_logo_position: "top_right",
      pdf_cover_text_vertical: "bottom",
      pdf_cover_overlay_style: "gradient_diag",
      pdf_cover_decoration_style: "pattern",
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_eyebrow_size: 11,
      pdf_cover_subtitle_size: 13,
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
  form: Partial<PisTemplatePdf>,
): string | null { return detectCoverStyle(form, COVER_PRESETS); }
