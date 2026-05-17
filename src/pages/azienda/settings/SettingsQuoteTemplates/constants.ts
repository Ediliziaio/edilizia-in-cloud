/**
 * SettingsQuoteTemplates — constants
 * Estratto da SettingsQuoteTemplates.tsx (MP-IMP-001 Fase 3).
 */
import type { QuoteTemplate, QuoteTemplateLayout, FontFamily } from "@/types/quoteTemplate";

export const LAYOUTS: { key: QuoteTemplateLayout; label: string; desc: string }[] = [
  { key: 'classic', label: 'Classic', desc: 'Header bianco, bordo colorato. Professionale.' },
  { key: 'modern', label: 'Modern', desc: 'Header full-color. Design contemporaneo.' },
  { key: 'minimal', label: 'Minimal', desc: 'Solo linee e tipografia. Elegante.' },
  { key: 'bold', label: 'Bold', desc: 'Sidebar colorata. Massimo impatto.' },
];

export const FONTS: { key: FontFamily; label: string; desc: string }[] = [
  { key: 'helvetica', label: 'Helvetica', desc: 'Moderno, leggibile' },
  { key: 'times', label: 'Times New Roman', desc: 'Classico, formale' },
  { key: 'courier', label: 'Courier', desc: 'Monospace' },
];

export const DESIGN_PRESETS: Array<{ name: string; desc: string; patch: Partial<QuoteTemplate> }> = [
  {
    name: "Executive",
    desc: "Look premium, ideale per offerte ad alto valore.",
    patch: {
      layout: "modern",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 1.9,
      line_height: 1.45,
      row_density: "comfortable",
      table_borders: "horizontal",
      page_margin_mm: 20,
      table_zebra: true,
    },
  },
  {
    name: "Compatto",
    desc: "Più righe per pagina, ottimo per listini lunghi.",
    patch: {
      layout: "classic",
      font_family: "helvetica",
      font_size_base: 9,
      heading_size_scale: 1.5,
      line_height: 1.25,
      row_density: "compact",
      table_borders: "horizontal",
      page_margin_mm: 14,
      table_zebra: true,
    },
  },
  {
    name: "Cantiere premium",
    desc: "Impatto forte e margini chiari per clienti retail.",
    patch: {
      layout: "bold",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 2.0,
      line_height: 1.4,
      row_density: "normal",
      table_borders: "all",
      page_margin_mm: 18,
      table_zebra: false,
      primary_color: "#EA580C",
      secondary_color: "#F97316",
      accent_color: "#FFF7ED",
      header_text_color: "#FFFFFF",
    },
  },
];

export const TEMPLATE_ASSET_BUCKET = "quote-template-assets";
export const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);
