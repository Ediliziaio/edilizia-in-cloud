-- 2B. PURCHASE_ORDERS
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  
  -- Numerazione automatica ODA-YYYY-NNNN
  oda_number TEXT NOT NULL,
  
  -- Stato workflow
  status TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza', 'inviato', 'confermato', 'parziale', 'ricevuto', 'annullato')),
  
  -- Date
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  
  -- Collegamento a ordine cliente (opzionale)
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Totali (calcolati via trigger)
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Pagamento
  payment_terms TEXT,
  payment_method TEXT,
  
  -- Note
  notes TEXT,
  internal_notes TEXT,
  
  -- Allegati
  attachment_url TEXT,
  
  -- Metadati
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
