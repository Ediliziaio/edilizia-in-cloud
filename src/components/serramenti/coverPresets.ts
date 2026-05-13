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
  /** Colore accent secondario (per dettagli decorativi nella mini-preview). */
  swatchAccent: string;
  /** Tag breve per uso ideale (mostrato sotto al nome). */
  tag: string;
  /** Esempio titolo cover che verrà mostrato nella mini-anteprima. */
  sampleTitle: string;
  /** Campi da applicare. */
  patch: CoverPresetPatch;
}

export const COVER_PRESETS: CoverPreset[] = [
  // ─── 1. Minimal ──────────────────────────────────────────────────────────
  {
    id: "minimal",
    nome: "Minimal",
    descrizione: "Sfondo bianco, tipografia pulita, zero distrazioni",
    emoji: "⚪",
    accent: "slate",
    swatchBg: "#FFFFFF",
    swatchText: "#0F172A",
    swatchAccent: "#64748B",
    tag: "B2B / Studi",
    sampleTitle: "Proposta\npersonalizzata.",
    patch: {
      pdf_cover_bg_color: "#FFFFFF",
      pdf_cover_text_color: "#0F172A",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 10,
      pdf_cover_title_size: 44,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: false,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 0,
    },
  },
  // ─── 2. Bold Nero ─────────────────────────────────────────────────────────
  {
    id: "bold",
    nome: "Bold Nero",
    descrizione: "Nero puro, titolone 56pt, massimo impatto visivo",
    emoji: "⚫",
    accent: "neutral",
    swatchBg: "#0A0A0A",
    swatchText: "#FFFFFF",
    swatchAccent: "#F59E0B",
    tag: "Drama / Lusso",
    sampleTitle: "La tua casa,\nnuova generazione.",
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
  // ─── 3. Premium Notte ─────────────────────────────────────────────────────
  {
    id: "premium",
    nome: "Premium Notte",
    descrizione: "Dark teal + ornamenti, fascia alta e case di pregio",
    emoji: "💎",
    accent: "teal",
    swatchBg: "#0F2A2E",
    swatchText: "#F5F5F4",
    swatchAccent: "#D4A574",
    tag: "Premium",
    sampleTitle: "Eleganza\nche dura.",
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
  // ─── 4. Editorial ────────────────────────────────────────────────────────
  {
    id: "editorial",
    nome: "Editorial",
    descrizione: "Foto full-bleed con overlay 60%, look magazine",
    emoji: "📰",
    accent: "amber",
    swatchBg: "#1C1917",
    swatchText: "#FAFAF9",
    swatchAccent: "#F59E0B",
    tag: "Con foto",
    sampleTitle: "Il tuo\nprogetto.",
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
  // ─── 5. Casa Calda ────────────────────────────────────────────────────────
  {
    id: "warm",
    nome: "Casa Calda",
    descrizione: "Marrone caldo + accent panna, tono familiare",
    emoji: "🏡",
    accent: "orange",
    swatchBg: "#7C2D12",
    swatchText: "#FEF3C7",
    swatchAccent: "#FBBF24",
    tag: "Residenziale",
    sampleTitle: "Casa,\ndolce casa.",
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
  // ─── 6. Eco Forest ────────────────────────────────────────────────────────
  {
    id: "eco",
    nome: "Eco Forest",
    descrizione: "Verde foresta + panna, per serramenti eco-sostenibili",
    emoji: "🌿",
    accent: "emerald",
    swatchBg: "#14532D",
    swatchText: "#ECFDF5",
    swatchAccent: "#86EFAC",
    tag: "Sostenibile",
    sampleTitle: "Comfort\nche rispetta.",
    patch: {
      pdf_cover_bg_color: "#14532D",
      pdf_cover_text_color: "#ECFDF5",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 44,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 40,
    },
  },
  // ─── 7. Marine Tech ──────────────────────────────────────────────────────
  {
    id: "marine",
    nome: "Marine Tech",
    descrizione: "Blu navy + accent argento, tono tecnologico moderno",
    emoji: "🌊",
    accent: "blue",
    swatchBg: "#0C2340",
    swatchText: "#F0F9FF",
    swatchAccent: "#60A5FA",
    tag: "Tech / Smart",
    sampleTitle: "Innovazione\nin ogni dettaglio.",
    patch: {
      pdf_cover_bg_color: "#0C2340",
      pdf_cover_text_color: "#F0F9FF",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 46,
      pdf_cover_subtitle_size: 13,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 50,
    },
  },
  // ─── 8. Sunset ───────────────────────────────────────────────────────────
  {
    id: "sunset",
    nome: "Sunset",
    descrizione: "Arancio bruciato + giallo crema, energia calda",
    emoji: "🌅",
    accent: "amber",
    swatchBg: "#9A3412",
    swatchText: "#FFF7ED",
    swatchAccent: "#FBBF24",
    tag: "Energia",
    sampleTitle: "Più luce,\npiù vita.",
    patch: {
      pdf_cover_bg_color: "#9A3412",
      pdf_cover_text_color: "#FFF7ED",
      pdf_cover_text_align: "left",
      pdf_cover_eyebrow_size: 11,
      pdf_cover_title_size: 46,
      pdf_cover_subtitle_size: 14,
      pdf_cover_show_decoration: true,
      pdf_cover_show_client_card: true,
      pdf_cover_overlay_opacity: 40,
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
