export type QuoteTemplateLayout = 'classic' | 'modern' | 'minimal' | 'bold';
export type LogoPosition = 'left' | 'center' | 'right';
export type LogoSize = 'small' | 'medium' | 'large';
export type FontFamily = 'helvetica' | 'times' | 'courier';

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
  show_quote_number: boolean;
  show_validity_date: boolean;
  show_company_details: boolean;
  show_client_details: boolean;
  show_payment_terms: boolean;
  show_delivery_terms: boolean;
  show_notes: boolean;
  show_page_numbers: boolean;
  footer_text: string;
  cover_tagline: string;
  show_watermark: boolean;
  watermark_text: string;
  created_at: string;
  updated_at: string;
}

export const COLOR_PALETTES = [
  { name: 'Blu Professionale', primary: '#1E40AF', secondary: '#3B82F6', accent: '#DBEAFE', headerText: '#FFFFFF' },
  { name: 'Verde Fiducia', primary: '#166534', secondary: '#22C55E', accent: '#DCFCE7', headerText: '#FFFFFF' },
  { name: 'Rosso Energia', primary: '#991B1B', secondary: '#EF4444', accent: '#FEE2E2', headerText: '#FFFFFF' },
  { name: 'Grigio Elegante', primary: '#374151', secondary: '#6B7280', accent: '#F3F4F6', headerText: '#FFFFFF' },
  { name: 'Viola Premium', primary: '#6D28D9', secondary: '#8B5CF6', accent: '#EDE9FE', headerText: '#FFFFFF' },
  { name: 'Arancio Energia', primary: '#C2410C', secondary: '#F97316', accent: '#FFF7ED', headerText: '#FFFFFF' },
  { name: 'Teal Moderno', primary: '#0F766E', secondary: '#14B8A6', accent: '#CCFBF1', headerText: '#FFFFFF' },
  { name: 'Nero Lusso', primary: '#111827', secondary: '#374151', accent: '#F9FAFB', headerText: '#FFFFFF' },
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
};
