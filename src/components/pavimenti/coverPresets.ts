import { detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";
/**
 * coverPresets.ts (Pavimenti) — Preset layout cover PDF.
 *
 * Parità con il sistema Serramenti/Fotovoltaico: ogni preset è una combinazione
 * COMPLETA di layout (bg/immagine + posizione verticale testo + allineamento +
 * overlay + decorazione + dimensioni font), applicata in batch su pdf_cover_*.
 *
 * NB: le colonne pdf_cover_* sono aggiunte a pav_template_pdf dalla migration
 * 20271110050000_pavimenti_cover_parity.sql (stessi tipi/default di
 * sr_template_pdf). I NOMI dei campi pdf_cover_* sono identici a Serramenti;
 * i sampleTitle sono adattati al tema pavimenti/ristrutturazione.
 *
 * Per i preset 'photo': il preset imposta `pdf_cover_image_url` con una stock
 * image suggerita (l'utente la cambia poi via galleria/upload). Per i preset
 * 'solid' l'immagine viene azzerata (null).
 */

export type CoverPresetCategory = "solid" | "photo";

/** Campi del template cover applicati in batch al click sul preset. Le union
 *  literal combaciano con il tipo del form dell'editor Pavimenti (`PavCoverForm`)
 *  → setForm type-safe. */
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

// Stock image suggerita per i preset photo (l'utente la cambia poi via galleria).
const STOCK_FALLBACK_FLOOR = "/cover-stock/pavimenti/1.jpg";

export const COVER_PRESETS: CoverPreset[] = [
  // ═══ SOLID — Solo colore di sfondo, no immagine ════════════════════════
  {
    id: "solid_minimal_top",
    nome: "Minimal · testo in alto",
    descrizione: "Sfondo bianco pulito, titolo grosso in alto, niente distrazioni",
    emoji: "⚪",
    category: "solid",
    tag: "Top · B2B",
    sampleTitle: "Preventivo\npavimenti.",
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
    sampleTitle: "Eleganza\nsotto i piedi.",
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
    sampleTitle: "La tua casa,\nnuova generazione.",
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
      pdf_cover_image_url: STOCK_FALLBACK_FLOOR,
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
      pdf_cover_image_url: STOCK_FALLBACK_FLOOR,
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
    sampleTitle: "Finiture\nche si vedono.",
    swatchBg: "#27272A",
    swatchText: "#FAFAFA",
    swatchAccent: "#FFFFFF",
    patch: {
      pdf_cover_bg_color: "#27272A",
      pdf_cover_image_url: STOCK_FALLBACK_FLOOR,
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
    sampleTitle: "Qualità\nin ogni dettaglio.",
    swatchBg: "#0C2340",
    swatchText: "#F0F9FF",
    swatchAccent: "#60A5FA",
    patch: {
      pdf_cover_bg_color: "#0C2340",
      pdf_cover_image_url: STOCK_FALLBACK_FLOOR,
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
  form: CoverPresetPatch,
): string | null { return detectCoverStyle(form, COVER_PRESETS); }
