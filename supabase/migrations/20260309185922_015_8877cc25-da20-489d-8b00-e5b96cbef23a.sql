-- 2C. PURCHASE_ORDER_ITEMS
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  
  -- Articolo
  description TEXT NOT NULL,
  sku TEXT,
  unit_of_measure TEXT DEFAULT 'pz',
  
  -- Quantità e prezzi
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 22,
  
  -- Calcolati
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (
    ROUND(quantity * unit_price * (1 - discount_percent / 100), 2)
  ) STORED,
  vat_amount NUMERIC(12,2) GENERATED ALWAYS AS (
    ROUND(quantity * unit_price * (1 - discount_percent / 100) * vat_rate / 100, 2)
  ) STORED,
  
  -- Ricezione parziale
  quantity_received NUMERIC(12,3) NOT NULL DEFAULT 0,
  received_date DATE,
  
  -- Collegamento a articolo template (opzionale)
  article_template_id UUID REFERENCES public.article_templates(id) ON DELETE SET NULL,
  
  -- Ordinamento
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Metadati
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
