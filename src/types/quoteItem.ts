export interface QuoteItemPro {
  id?: string;
  item_type: 'product' | 'service';
  item_category:
    | 'prodotto'
    | 'posa'
    | 'trasporto'
    | 'smaltimento'
    | 'nolo'
    | 'nota'
    | 'subtotale'
    | 'sconto';
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  vat_rate: number;
  unit_of_measure: string;
  sort_order: number;
  article_template_id?: string | null;
  tariffa_id?: string | null;
  prezzo_acquisto: number;
  mostra_nel_pdf: boolean;
  is_optional: boolean;
  misura_x?: number | null;
  misura_y?: number | null;
  _parentIdx?: number;
}
