import { detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";
/**
 * coverPresets.ts (Fotovoltaico) — Preset layout cover PDF.
 *
 * Parità con il sistema Serramenti: ogni preset è una combinazione COMPLETA di
 * layout (bg/immagine + posizione verticale testo + allineamento + overlay +
 * decorazione + dimensioni font), applicata in batch su pdf_cover_*.
 *
 * NB: i campi pdf_cover_{decoration_style,show_decoration,text_vertical,
 * overlay_style,title_size,subtitle_size,eyebrow_size} sono aggiunti a
 * fv_template_pdf dalla migration 20271109000000_fv_cover_parity.sql.
 */

import { COVER_STOCK_IMAGES } from "./coverStockImages";

export type CoverPresetCategory = "solid" | "photo";

/** Campi del template cover applicati in batch al click sul preset. Le union
 *  literal combaciano con il tipo FvTemplate dell'editor → setForm type-safe. */
export interface CoverPresetPatch {
  pdf_cover_bg_color?: string | null;
  pdf_cover_image_url?: string | null;
  pdf_cover_overlay_opacity?: number | null;
  pdf_cover_overlay_style?: "flat" | "gradient" | "gradient_diag" | "vignette" | null;
  pdf_cover_text_color?: string | null;
  pdf_cover_text_align?: "left" | "center" | null;
  pdf_cover_text_vertical?: "top" | "center" | "bottom" | null;
  pdf_cover_eyebrow_size?: number | null;
  pdf_cover_title_size?: number | null;
  pdf_cover_subtitle_size?: number | null;
  pdf_cover_show_decoration?: boolean | null;
  pdf_cover_decoration_style?: "square" | "circle" | "line" | "pattern" | "none" | null;
  pdf_cover_show_client_card?: boolean | null;
  pdf_cover_logo_position?: "top_left" | "top_right" | "top_center" | "hidden" | null;
}

export interface CoverPreset {
  id: string;
  nome: string;
  descrizione: string;
  emoji: string;
  category: CoverPresetCategory;
  tag: string;
  sampleTitle: string;
  swatchBg: string;
  swatchText: string;
  swatchAccent: string;
  patch: CoverPresetPatch;
}

// Immagine locale curata per i preset foto: il PDF resta riproducibile anche
// senza rete e la galleria usa la stessa libreria proprietaria dell'editor.
const STOCK_FALLBACK_SOLAR = COVER_STOCK_IMAGES[0].url;

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
    sampleTitle: "Energia\nche dura.",
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
    sampleTitle: "La tua energia,\nnuova generazione.",
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
    nome: "Solare Caldo · testo in basso",
    descrizione: "Blu notte + accent ambra, tono energia residenziale",
    emoji: "🌅",
    category: "solid",
    tag: "Bottom · Residenziale",
    sampleTitle: "Indipendenza\nenergetica.",
    swatchBg: "#1E3A5F",
    swatchText: "#FEF3C7",
    swatchAccent: "#FBBF24",
    patch: {
      pdf_cover_bg_color: "#1E3A5F",
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
    sampleTitle: "Il tuo\nimpianto.",
    swatchBg: "#1C1917",
    swatchText: "#FAFAF9",
    swatchAccent: "#F59E0B",
    patch: {
      pdf_cover_bg_color: "#1C1917",
      pdf_cover_image_url: STOCK_FALLBACK_SOLAR,
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
    sampleTitle: "La tua\nenergia solare.",
    swatchBg: "#0F172A",
    swatchText: "#FFFFFF",
    swatchAccent: "#FBBF24",
    patch: {
      pdf_cover_bg_color: "#0F172A",
      pdf_cover_image_url: STOCK_FALLBACK_SOLAR,
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
    sampleTitle: "Risparmio\nche si vede.",
    swatchBg: "#27272A",
    swatchText: "#FAFAFA",
    swatchAccent: "#FFFFFF",
    patch: {
      pdf_cover_bg_color: "#27272A",
      pdf_cover_image_url: STOCK_FALLBACK_SOLAR,
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
    nome: "Tech · diagonale",
    descrizione: "Foto sfondo + gradient diagonale blu, look tech moderno",
    emoji: "🌊",
    category: "photo",
    tag: "Bottom · Tech",
    sampleTitle: "Innovazione\nin ogni raggio.",
    swatchBg: "#0C2340",
    swatchText: "#F0F9FF",
    swatchAccent: "#60A5FA",
    patch: {
      pdf_cover_bg_color: "#0C2340",
      pdf_cover_image_url: STOCK_FALLBACK_SOLAR,
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
 * Detection del preset attivo dai campi del form. Per i preset photo non
 * confrontiamo pdf_cover_image_url (l'utente può aver caricato una sua foto).
 */
export function detectActiveCoverPreset(
  form: CoverPresetPatch,
): string | null { return detectCoverStyle(form, COVER_PRESETS); }
