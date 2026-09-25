/**
 * SettingsQuoteTemplates — constants
 * Estratto da SettingsQuoteTemplates.tsx (MP-IMP-001 Fase 3).
 */
import type { QuoteTemplate, QuoteTemplateLayout, FontFamily } from "@/types/quoteTemplate";

export interface CompleteOfferBlueprint {
  key: string;
  name: string;
  description: string;
  patch: Partial<QuoteTemplate>;
}

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
    name: "Standard professionale",
    desc: "La base consigliata: copertina, ritmo arioso e investimento facile da leggere.",
    patch: {
      layout: "classic",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 1.75,
      line_height: 1.45,
      row_density: "comfortable",
      table_borders: "horizontal",
      page_margin_mm: 20,
      table_zebra: true,
      primary_color: "#1E40AF",
      secondary_color: "#2563EB",
      accent_color: "#EFF6FF",
      text_color: "#111827",
      header_text_color: "#FFFFFF",
      header_alignment: "left",
      cover_title: "Il tuo *progetto*, spiegato bene",
      cover_subtitle: "Un'offerta completa con priorità, tempi e investimento trasparenti.",
      cover_tagline: "Più chiarezza oggi, più serenità durante i lavori.",
      footer_text: "Grazie per la fiducia. Il tuo referente resta disponibile per ogni chiarimento.",
      payment_terms_text: "Acconto del 30% alla conferma. Le eventuali fasi intermedie e il saldo sono indicati nel piano pagamenti.",
      delivery_terms_text: "La pianificazione definitiva viene confermata dopo il sopralluogo e la verifica dei materiali.",
      show_cover_image: false,
      show_contractual_terms: true,
      show_legal_terms: false,
    },
  },
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

/**
 * Modelli completi proposti all'utente.
 *
 * Ogni blueprint è già un'offerta master autonoma: la copertina è inline,
 * le condizioni sono inline e il preventivatore standard può selezionarla
 * direttamente. I blocchi separati restano disponibili solo come modalità
 * avanzata per chi vuole riusare contenuti tra più offerte.
 */
export const COMPLETE_OFFER_BLUEPRINTS: CompleteOfferBlueprint[] = [
  {
    key: "studio-premium",
    name: "Studio Premium",
    description: "Copertina navy, gerarchia editoriale ariosa e chiusura elegante per lavori ad alto valore.",
    patch: {
      kind: "offerta",
      layout: "modern",
      primary_color: "#1E3A5F",
      secondary_color: "#2563EB",
      accent_color: "#EFF6FF",
      text_color: "#172033",
      header_text_color: "#FFFFFF",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 1.9,
      line_height: 1.45,
      row_density: "comfortable",
      table_zebra: true,
      table_borders: "horizontal",
      header_alignment: "left",
      page_margin_mm: 20,
      cover_title: "La tua *proposta* su misura",
      cover_subtitle: "Soluzioni, investimento e tempi definiti con chiarezza.",
      cover_tagline: "Un progetto seguito con metodo, dall'idea alla consegna.",
      footer_text: "Grazie per la fiducia. Il tuo referente resta disponibile per ogni chiarimento.",
      payment_terms_text: "Acconto del 30% alla conferma. Eventuali SAL e saldo vengono definiti nel piano di lavoro.",
      delivery_terms_text: "Tempi e calendario vengono confermati dopo il rilievo e la disponibilità dei materiali.",
      show_cover_image: false,
      linked_cover_id: null,
      linked_terms_id: null,
      linked_legal_id: null,
      linked_product_ids: [],
      linked_section_ids: [],
      show_contractual_terms: true,
      show_legal_terms: false,
    },
  },
  {
    key: "cantiere-chiaro",
    name: "Cantiere Chiaro",
    description: "Layout classico premium: dati, lavorazioni, investimento e condizioni leggibili in ogni pagina.",
    patch: {
      kind: "offerta",
      layout: "classic",
      primary_color: "#1E40AF",
      secondary_color: "#2563EB",
      accent_color: "#EFF6FF",
      text_color: "#111827",
      header_text_color: "#FFFFFF",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 1.75,
      line_height: 1.45,
      row_density: "normal",
      table_zebra: true,
      table_borders: "horizontal",
      header_alignment: "left",
      page_margin_mm: 20,
      cover_title: "Il tuo *progetto*, spiegato bene",
      cover_subtitle: "Un'offerta completa con priorità, tempi e investimento trasparenti.",
      cover_tagline: "Più chiarezza oggi, più serenità durante i lavori.",
      footer_text: "EdiliziaInCloud · Proposta preparata per il tuo progetto.",
      payment_terms_text: "Acconto del 30% alla conferma. Le eventuali fasi intermedie e il saldo sono indicati nel piano pagamenti.",
      delivery_terms_text: "La pianificazione definitiva viene confermata dopo il sopralluogo e la verifica dei materiali.",
      show_cover_image: false,
      linked_cover_id: null,
      linked_terms_id: null,
      linked_legal_id: null,
      linked_product_ids: [],
      linked_section_ids: [],
      show_contractual_terms: true,
      show_legal_terms: false,
    },
  },
  {
    key: "retail-energia",
    name: "Retail Energia",
    description: "Impatto più deciso, sidebar colorata e messaggi brevi per offerte retail facili da capire e ricordare.",
    patch: {
      kind: "offerta",
      layout: "bold",
      primary_color: "#EA580C",
      secondary_color: "#F97316",
      accent_color: "#FFF7ED",
      text_color: "#1C1917",
      header_text_color: "#FFFFFF",
      font_family: "helvetica",
      font_size_base: 10,
      heading_size_scale: 2,
      line_height: 1.4,
      row_density: "normal",
      table_zebra: false,
      table_borders: "all",
      header_alignment: "left",
      page_margin_mm: 18,
      cover_title: "Una casa più *bella* e funzionale",
      cover_subtitle: "La soluzione giusta, con costi e prossimi passi sempre sotto controllo.",
      cover_tagline: "Scelte semplici. Risultati concreti.",
      footer_text: "La tua proposta, il tuo prossimo passo.",
      payment_terms_text: "Acconto del 30% alla conferma. Il saldo segue le fasi concordate nel preventivo.",
      delivery_terms_text: "Riceverai il calendario operativo definitivo prima dell'avvio dei lavori.",
      show_cover_image: false,
      linked_cover_id: null,
      linked_terms_id: null,
      linked_legal_id: null,
      linked_product_ids: [],
      linked_section_ids: [],
      show_contractual_terms: true,
      show_legal_terms: false,
    },
  },
];

export const TEMPLATE_ASSET_BUCKET = "quote-template-assets";
export const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);
