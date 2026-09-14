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
  // Addendum P2-04: configurazione di una famiglia del listino.
  // Popolati dalle righe configurate da listino (FamilyConfigurator). Se family_id
  // è valorizzato, article_template_id DEVE essere null (check DB).
  family_id?: string | null;
  axis_selections?: Record<string, string> | null;
  // STEP 6 Serramenti Avanzati: fornitore + linea prodotto usati per calcolare
  // il prezzo base dalla matrice. Popolati SOLO se il wizard ha selezionato
  // una linea (feature listini_serramenti_avanzati). Servono per:
  //  - rigenerare il prezzo in modifica con le stesse regole
  //  - calcolo margine atteso coerente (FASE 11)
  supplier_catalog_id?: string | null;
  supplier_product_line_id?: string | null;
  _parentIdx?: number;
  // Preventivatore Unificato (Sprint A §4.9) — parent/child client-side
  // per la posa legata. `parent_item_id` è la colonna DB (persistita dopo
  // il SAVE), `client_temp_id`/`parent_temp_id` sono UUID lato client
  // usati mentre l'item vive ancora solo in memoria.
  parent_item_id?: string | null;
  client_temp_id?: string | null;
  parent_temp_id?: string | null;
  // MP-preventivi-v2: URL immagine (da article_families.immagine_url o
  // article_templates.immagine_url). Persistita sul preventivo come snapshot
  // cosi` la riga resta visualizzabile anche se il prodotto viene modificato
  // in seguito nel listino.
  image_url?: string | null;
}
