export type QuoteTemplateLayout = 'classic' | 'modern' | 'minimal' | 'bold';
export type LogoPosition = 'left' | 'center' | 'right';
export type LogoSize = 'small' | 'medium' | 'large';
export type FontFamily = 'helvetica' | 'times' | 'courier';
export type RowDensity = 'compact' | 'normal' | 'comfortable';
export type TableBorders = 'none' | 'horizontal' | 'all';
export type TextAlignment = 'left' | 'center' | 'right';

export interface QuoteTemplate {
  id: string;
  company_id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
  layout: QuoteTemplateLayout;
  logo_url: string | null;
  logo_position: LogoPosition;
  logo_size: LogoSize;
  show_logo: boolean;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  text_color: string;
  header_text_color: string;
  font_family: FontFamily;
  // Tipografia avanzata (migration 20261024180000)
  font_size_base: number;       // 7-16 pt
  heading_size_scale: number;   // 1.00-3.00
  line_height: number;          // 1.00-2.50
  // Layout tabella
  row_density: RowDensity;
  table_zebra: boolean;
  table_borders: TableBorders;
  // Header e pagina
  header_alignment: TextAlignment;
  page_margin_mm: number;       // 8-30
  // Visibilità elementi
  show_quote_number: boolean;
  show_validity_date: boolean;
  show_company_details: boolean;
  show_client_details: boolean;
  show_payment_terms: boolean;
  show_delivery_terms: boolean;
  show_notes: boolean;
  show_page_numbers: boolean;
  // Testi custom
  footer_text: string;
  cover_tagline: string;
  show_watermark: boolean;
  watermark_text: string;
  payment_terms_text: string;
  delivery_terms_text: string;
  bank_details: string;
  // Copertina personalizzata + termini contrattuali/legali
  cover_image_url: string | null;
  cover_title: string | null;
  cover_subtitle: string | null;
  show_cover_image: boolean;
  contractual_terms_text: string | null;
  legal_terms_text: string | null;
  show_contractual_terms: boolean;
  show_legal_terms: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Lista merge tag supportati nei testi del template.
 * Vengono sostituiti dal generatore PDF al momento dell'export.
 * Tenuto sincronizzato con la view DB v_quote_template_merge_tags.
 */
export interface MergeTag {
  tag: string;          // es. "cliente.nome"
  descrizione: string;
  group: "cliente" | "cantiere" | "preventivo" | "azienda" | "data";
}

export const MERGE_TAGS: MergeTag[] = [
  // Cliente — persona fisica
  { tag: "cliente.nome", descrizione: "Nome del cliente", group: "cliente" },
  { tag: "cliente.cognome", descrizione: "Cognome del cliente", group: "cliente" },
  { tag: "cliente.nome_completo", descrizione: "Nome + cognome", group: "cliente" },
  { tag: "cliente.email", descrizione: "Email cliente", group: "cliente" },
  { tag: "cliente.telefono", descrizione: "Telefono cliente", group: "cliente" },
  { tag: "cliente.codice_fiscale", descrizione: "Codice fiscale", group: "cliente" },
  { tag: "cliente.indirizzo", descrizione: "Indirizzo residenza", group: "cliente" },
  { tag: "cliente.cap", descrizione: "CAP residenza", group: "cliente" },
  { tag: "cliente.citta", descrizione: "Città residenza", group: "cliente" },
  { tag: "cliente.provincia", descrizione: "Provincia residenza", group: "cliente" },
  // Cliente — persona giuridica (P.IVA)
  { tag: "cliente.ragione_sociale", descrizione: "Ragione sociale (P.IVA)", group: "cliente" },
  { tag: "cliente.partita_iva", descrizione: "Partita IVA", group: "cliente" },
  { tag: "cliente.sede_legale", descrizione: "Sede legale (P.IVA)", group: "cliente" },
  { tag: "cliente.legale_rappresentante", descrizione: "Legale rappresentante (P.IVA)", group: "cliente" },
  { tag: "cliente.pec", descrizione: "PEC", group: "cliente" },
  { tag: "cliente.codice_destinatario", descrizione: "Codice SDI", group: "cliente" },
  // Cantiere
  { tag: "cantiere.indirizzo", descrizione: "Indirizzo cantiere", group: "cantiere" },
  { tag: "cantiere.citta", descrizione: "Città cantiere", group: "cantiere" },
  { tag: "cantiere.note", descrizione: "Note cantiere", group: "cantiere" },
  // Preventivo
  { tag: "preventivo.numero", descrizione: "Numero preventivo", group: "preventivo" },
  { tag: "preventivo.data", descrizione: "Data preventivo", group: "preventivo" },
  { tag: "preventivo.scadenza", descrizione: "Scadenza offerta", group: "preventivo" },
  { tag: "preventivo.totale", descrizione: "Totale offerta", group: "preventivo" },
  { tag: "preventivo.subtotale", descrizione: "Subtotale (imponibile)", group: "preventivo" },
  { tag: "preventivo.iva", descrizione: "Importo IVA", group: "preventivo" },
  // Azienda (la tua)
  { tag: "azienda.ragione_sociale", descrizione: "Ragione sociale azienda", group: "azienda" },
  { tag: "azienda.partita_iva", descrizione: "P.IVA azienda", group: "azienda" },
  { tag: "azienda.indirizzo", descrizione: "Indirizzo azienda", group: "azienda" },
  { tag: "azienda.email", descrizione: "Email azienda", group: "azienda" },
  { tag: "azienda.telefono", descrizione: "Telefono azienda", group: "azienda" },
  // Data
  { tag: "data.oggi", descrizione: "Data odierna", group: "data" },
  { tag: "data.anno", descrizione: "Anno corrente", group: "data" },
];

export const COLOR_PALETTES = [
  // Palette base
  { name: 'Blu Professionale', primary: '#1E40AF', secondary: '#3B82F6', accent: '#DBEAFE', headerText: '#FFFFFF' },
  { name: 'Verde Fiducia', primary: '#166534', secondary: '#22C55E', accent: '#DCFCE7', headerText: '#FFFFFF' },
  { name: 'Rosso Energia', primary: '#991B1B', secondary: '#EF4444', accent: '#FEE2E2', headerText: '#FFFFFF' },
  { name: 'Grigio Elegante', primary: '#374151', secondary: '#6B7280', accent: '#F3F4F6', headerText: '#FFFFFF' },
  { name: 'Viola Premium', primary: '#6D28D9', secondary: '#8B5CF6', accent: '#EDE9FE', headerText: '#FFFFFF' },
  { name: 'Arancio Energia', primary: '#C2410C', secondary: '#F97316', accent: '#FFF7ED', headerText: '#FFFFFF' },
  { name: 'Teal Moderno', primary: '#0F766E', secondary: '#14B8A6', accent: '#CCFBF1', headerText: '#FFFFFF' },
  { name: 'Nero Lusso', primary: '#111827', secondary: '#374151', accent: '#F9FAFB', headerText: '#FFFFFF' },
  // Palette specifiche edilizia e serramenti
  { name: 'Navy Edilizia', primary: '#1E3A5F', secondary: '#2563EB', accent: '#EFF6FF', headerText: '#FFFFFF' },
  { name: 'Cantiere Arancio', primary: '#EA580C', secondary: '#F97316', accent: '#FFF7ED', headerText: '#FFFFFF' },
  { name: 'Verde Bosco', primary: '#14532D', secondary: '#16A34A', accent: '#F0FDF4', headerText: '#FFFFFF' },
  { name: 'Acciaio', primary: '#1C1917', secondary: '#57534E', accent: '#FAFAF9', headerText: '#FFFFFF' },
  { name: 'Sabbia Classico', primary: '#78350F', secondary: '#B45309', accent: '#FFFBEB', headerText: '#FFFFFF' },
] as const;

export const DEFAULT_TEMPLATE: Omit<QuoteTemplate, 'id' | 'company_id' | 'created_at' | 'updated_at'> = {
  name: 'Template Default',
  is_default: true,
  is_active: true,
  layout: 'classic',
  logo_url: null,
  logo_position: 'left',
  logo_size: 'medium',
  show_logo: true,
  primary_color: '#1E40AF',
  secondary_color: '#3B82F6',
  accent_color: '#DBEAFE',
  text_color: '#111827',
  header_text_color: '#FFFFFF',
  font_family: 'helvetica',
  font_size_base: 10,
  heading_size_scale: 1.60,
  line_height: 1.40,
  row_density: 'normal',
  table_zebra: true,
  table_borders: 'horizontal',
  header_alignment: 'left',
  page_margin_mm: 18,
  show_quote_number: true,
  show_validity_date: true,
  show_company_details: true,
  show_client_details: true,
  show_payment_terms: true,
  show_delivery_terms: true,
  show_notes: true,
  show_page_numbers: true,
  footer_text: '',
  cover_tagline: '',
  show_watermark: false,
  watermark_text: 'OFFERTA RISERVATA',
  payment_terms_text: 'Acconto del 30% alla firma del contratto. Saldo alla consegna.',
  delivery_terms_text: '3-4 settimane dalla conferma ordine.',
  bank_details: '',
  cover_image_url: null,
  cover_title: null,
  cover_subtitle: null,
  show_cover_image: false,
  contractual_terms_text: null,
  legal_terms_text: null,
  show_contractual_terms: true,
  show_legal_terms: false,
};

/* ─── Label/Option utilities per UI ─────────────────────────── */
export const FONT_SIZE_PRESETS = [
  { value: 8, label: "Piccolo (8pt)" },
  { value: 9, label: "Stretto (9pt)" },
  { value: 10, label: "Normale (10pt)" },
  { value: 11, label: "Medio (11pt)" },
  { value: 12, label: "Grande (12pt)" },
  { value: 14, label: "Molto grande (14pt)" },
] as const;

export const LINE_HEIGHT_PRESETS = [
  { value: 1.15, label: "Stretta (1.15)" },
  { value: 1.30, label: "Compatta (1.30)" },
  { value: 1.40, label: "Normale (1.40)" },
  { value: 1.60, label: "Arieggiata (1.60)" },
  { value: 1.80, label: "Ampia (1.80)" },
] as const;

export const ROW_DENSITY_LABELS: Record<RowDensity, { label: string; description: string; padding: number }> = {
  compact:     { label: "Compatta",    description: "Più righe per pagina", padding: 4 },
  normal:      { label: "Normale",     description: "Bilanciata",           padding: 7 },
  comfortable: { label: "Arieggiata",  description: "Più spazio",           padding: 11 },
};

export const TABLE_BORDERS_LABELS: Record<TableBorders, string> = {
  none: "Nessuno",
  horizontal: "Righe",
  all: "Griglia",
};

export const HEADER_ALIGNMENT_LABELS: Record<TextAlignment, string> = {
  left: "Sinistra",
  center: "Centro",
  right: "Destra",
};
