-- 3. quotes — main quotes/preventivi table
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'bozza',
  -- Client info (denormalized for PDF)
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_company TEXT,
  client_address TEXT,
  client_fiscal_code TEXT,
  client_vat_number TEXT,
  -- Content
  title TEXT DEFAULT 'Preventivo',
  description TEXT,
  notes TEXT,
  internal_notes TEXT,
  terms_and_conditions TEXT,
  validity_days INTEGER DEFAULT 30,
  expires_at TIMESTAMPTZ,
  -- Totals (auto-calculated by trigger)
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  -- PDF
  pdf_storage_path TEXT,
  pdf_generated_at TIMESTAMPTZ,
  -- Signature
  signature_token UUID,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_ip TEXT,
  refused_at TIMESTAMPTZ,
  refused_reason TEXT,
  -- Opportunity link
  opportunity_id UUID REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  -- Meta
  created_by UUID NOT NULL,
  assigned_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
