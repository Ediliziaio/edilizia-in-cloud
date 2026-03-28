-- ============================================================
-- MOVIMENTI CASSA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.movimenti_cassa_native (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.documenti_fiscali(id),

  tipo TEXT NOT NULL CHECK (tipo IN ('incasso','pagamento','storno','rettifica')),
  data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
  importo DECIMAL(15,2) NOT NULL,
  metodo TEXT,
  riferimento TEXT,
  note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
