-- Crea tabella f24_entries per storico F24 generati

CREATE TABLE IF NOT EXISTS public.f24_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anno INTEGER NOT NULL,
  mese INTEGER,
  tributo_code TEXT NOT NULL,
  tributo_descrizione TEXT NOT NULL,
  importo NUMERIC(12,2) NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'da_pagare'
    CHECK (stato IN ('da_pagare','pagato','annullato')),
  data_scadenza DATE,
  data_pagamento DATE,
  note TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.f24_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY f24_company ON public.f24_entries
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_f24_company_anno ON public.f24_entries(company_id, anno);
CREATE INDEX IF NOT EXISTS idx_f24_scadenza ON public.f24_entries(company_id, data_scadenza) WHERE stato = 'da_pagare';
