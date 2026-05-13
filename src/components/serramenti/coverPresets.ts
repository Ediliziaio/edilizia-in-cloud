/**
 * coverPresets.ts — M12 · preset stili cover 1-click
 *
 * Ogni preset rappresenta una composizione coerente dei campi `pdf_cover_*`
 * della tabella `sr_template_pdf`. Applicare un preset = settare tutti i
 * campi in batch (no migration: i campi DB esistono già da M1-M4).
 *
 * I valori sono progettati per essere "buoni out-of-the-box": tipografia,
 * contrasto e gerarchia visiva sono già calibrati. L'utente può poi
 * sovrascrivere singoli campi.
 *
 * NB: `pdf_cover_image_url` NON viene mai sovrascritto dai preset — è
 * un asset uploadato dall'utente. Il preset definisce solo overlay + colori +
 * tipografia + decorazioni; l'immagine resta quella scelta dall'utente.
 */

import type { SrTemplatePdfRow } from "@/types/serramenti";

// I campi che un preset può sovrascrivere. Sottoinsieme di SrTemplatePdfRow.
export type CoverPresetPatch = Partial<Pick<SrTemplatePdfRow,
  | "pdf_cover_bg_color"
  | "pdf_cover_overlay_opacity"
  | "pdf_cover_text_color"
  | "pdf_cover_text_align"
  | "pdf_cover_eyebrow_size"
  | "pdf_cover_title_size"
  | "pdf_cover_subtitle_size"
  | "pdf_cover_show_decoration"
  | "pdf_cover_show_client_card"
>>;

export interface CoverPreset {
  /** ID stabile salvato come hint (no schema DB, sta solo in memoria). */
  id: string;
  /** Nome visualizzato sulla card (italiano). */
  nome: string;
  /** Una riga descrittiva del feeling (tono di voce, brief design). */
  descrizione: string;
  /** Emoji rappresentativa (no asset image necessario). */
  emoji: string;
  /** Colore badge accent della card preset (palette tailwind-friendly). */
  accent: string;
  /** Sample swatch da mostrare in mini-preview della card (bg → testo). */
  swatchBg: string;
  swatchText: string;
  /** Campi da applicare. */
  patch: CoverPresetPatch;
}

export const COVER_PRESETS: CoverPreset[] = [
  // ─── 1. Minimal ──────────────────────────────────────────────────────────
  {
    id: "minimal",
    nome: "Minimal",
    descrizione: "Sfondo bianco · tipografia pulita · zero distrazioni. Per clienti business-to-business.",
    emoji: "⚪",
    accent: "slate",
    swatchBg: "#FFFFFF",
    swatchText: "#111111",
    patch: {
      pdf_cover_bg_color: "#FFFFFF",
      pdf_cover_text_color: "#111111",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 10,
      pdf_cover_title_size: 42,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: false,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
    },
  },
  // ─── 2. Bold ─────────────────────────────────────────────────────────────
  {
    id: "bold",
    nome: "Bold",
    descrizione: "Nero pieno · titolone 56pt · accent color forte. Massimo impatto visivo.",
    emoji: "⚫",
    accent: "neutral",
    swatchBg: "#0A0A0A",
    swatchText: "#FFFFFF",
    patch: {
      pdf_cover_bg_color: "#0A0A0A",
      pdf_cover_text_color: "#FFFFFF",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 56,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
    },
  },
  // ─── 3. Editorial ────────────────────────────────────────────────────────
  {
    id: "editorial",
    nome: "Editorial",
    descrizione: "Foto full-bleed · overlay scuro 60% · titolo grosso. Per progetti con foto reali.",
    emoji: "📰",
    accent: "amber",
    swatchBg: "#1C1917",
    swatchText: "#FAFAF9",
    patch: {
      pdf_cover_bg_color: "#1C1917",
      pdf_cover_text_color: "#FAFAF9",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 48,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: false,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 60,
    },
  },
  // ─── 4. Premium ──────────────────────────────────────────────────────────
  {
    id: "premium",
    nome: "Premium",
    descrizione: "Dark teal · titolo centrato · ornamenti accent. Per fascia alta / case di pregio.",
    emoji: "💎",
    accent: "teal",
    swatchBg: "#0F2A2E",
    swatchText: "#F5F5F4",
    patch: {
      pdf_cover_bg_color: "#0F2A2E",
      pdf_cover_text_color: "#F5F5F4",
      pdf_cover_text_align: "center",
      pdf_cover_eyebrow_size: 10,
      pdf_cover_title_size: 44,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 55,
    },
  },
  // ─── 5. Architectural ────────────────────────────────────────────────────
  {
    id: "architectural",
    nome: "Architectural",
    descrizione: "Foto cantiere · overlay leggero 35% · griglia modulare · tono professionale.",
    emoji: "🏗️",
    accent: "stone",
    swatchBg: "#27272A",
    swatchText: "#FAFAFA",
    patch: {
      pdf_cover_bg_color: "#27272A",
      pdf_cover_text_color: "#FAFAFA",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 9,
      pdf_cover_title_size: 38,
      pdf_cover_subtitle_size: 12,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 35,
    },
  },
  // ─── 6. Warm Home ────────────────────────────────────────────────────────
  {
    id: "warm",
    nome: "Warm Home",
    descrizione: "Tinte calde · tono familiare · per clienti residenziali / ristrutturazioni casa.",
    emoji: "🏡",
    accent: "orange",
    swatchBg: "#7C2D12",
    swatchText: "#FEF3C7",
    patch: {
      pdf_cover_bg_color: "#7C2D12",
      pdf_cover_text_color: "#FEF3C7",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 44,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 45,
    },
  },
];

/**
 * Detection del preset attualmente attivo basato sui campi del form.
 * Confronta i valori chiave del preset con quelli correnti per evidenziare
 * la card nell'UI. Tolleranza zero — basta un campo diverso → no match.
 */
export function detectActiveCoverPreset(
  form: Partial<SrTemplatePdfRow>,
): string | null {
  for (const preset of COVER_PRESETS) {
    const patch = preset.patch;
    const allMatch = (Object.keys(patch) as (keyof CoverPresetPatch)[]).every((k) => {
      const expected = patch[k];
      const actual = form[k];
      // Confronto stretto: null/undefined equivalenti.
      if (expected == null && actual == null) return true;
      return expected === actual;
    });
    if (allMatch) return preset.id;
  }
  return null;
}
