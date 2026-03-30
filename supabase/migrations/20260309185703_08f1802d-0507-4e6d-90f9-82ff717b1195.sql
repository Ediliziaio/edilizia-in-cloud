-- =============================================
-- STEP 1: Scadenzario Unificato + Prima Nota
-- =============================================

-- 1A. Tabella SCADENZE (scadenzario unificato)
CREATE TABLE IF NOT EXISTS public.scadenze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Tipo scadenza
  tipo TEXT NOT NULL CHECK (tipo IN ('incasso_cliente', 'pagamento_fornitore', 'costo_aziendale', 'scadenza_fiscale')),
  
  -- Direzione generata automaticamente
  direction TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN tipo = 'incasso_cliente' THEN 'entrata'
      ELSE 'uscita'
    END
  ) STORED,
  
  -- Dati principali
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'da_pagare' CHECK (status IN ('da_pagare', 'pagata', 'parziale', 'annullata')),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_date DATE,
  payment_method TEXT,
  
  -- Collegamenti opzionali
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cost_id UUID REFERENCES public.company_costs(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  
  -- Metadati
  notes TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
