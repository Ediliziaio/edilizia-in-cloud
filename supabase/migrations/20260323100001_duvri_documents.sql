-- DUVRI: Documento Unico Valutazione Rischi da Interferenza
CREATE TABLE public.duvri_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza','firmato','archiviato')),
  committente_nome TEXT NOT NULL,
  committente_piva TEXT,
  subappaltatori JSONB DEFAULT '[]',
  interferenze JSONB DEFAULT '[]',
  misure_prevenzione TEXT,
  costi_sicurezza DECIMAL(10,2) DEFAULT 0,
  generated_content TEXT,
  firmato_committente_il TIMESTAMPTZ,
  firmato_subappaltatore_il TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.duvri_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_duvri" ON public.duvri_documents FOR ALL
  USING (company_id = public.get_my_company_id());
