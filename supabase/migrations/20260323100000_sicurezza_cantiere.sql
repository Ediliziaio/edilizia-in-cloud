-- POS: Piano Operativo di Sicurezza
CREATE TABLE public.pos_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza','approvato','archiviato')),
  tipo_lavori TEXT NOT NULL,
  indirizzo_cantiere TEXT NOT NULL,
  data_inizio DATE,
  data_fine_prevista DATE,
  responsabile_sicurezza TEXT,
  numero_lavoratori INTEGER DEFAULT 1,
  rischi_presenti JSONB DEFAULT '[]',
  dpi_richiesti JSONB DEFAULT '[]',
  procedure_operative TEXT,
  generated_content TEXT,
  generated_by TEXT DEFAULT 'ai',
  pdf_url TEXT,
  firmato_da TEXT,
  firmato_il TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_pos" ON public.pos_documents FOR ALL
  USING (company_id = public.get_my_company_id());
