-- 1B. Tabella PRIMA_NOTA_ENTRIES
CREATE TABLE public.prima_nota_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Dati movimento
  direction TEXT NOT NULL CHECK (direction IN ('entrata', 'uscita')),
  category TEXT NOT NULL DEFAULT 'altro',
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Metodo e riferimenti
  payment_method TEXT,
  reference_number TEXT,
  
  -- Collegamenti opzionali
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cost_id UUID REFERENCES public.company_costs(id) ON DELETE SET NULL,
  scadenza_id UUID REFERENCES public.scadenze(id) ON DELETE SET NULL,
  
  -- Auto-generated vs manual
  is_auto BOOLEAN NOT NULL DEFAULT false,
  auto_source TEXT, -- 'invoice_payment', 'cost_payment', 'scadenza_payment'
  
  -- Allegato
  attachment_url TEXT,
  attachment_name TEXT,
  
  -- Metadati
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
