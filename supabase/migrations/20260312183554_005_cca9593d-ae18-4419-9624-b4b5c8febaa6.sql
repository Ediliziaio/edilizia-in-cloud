-- ============================================================
-- SDI LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sdi_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.documenti_fiscali(id),

  evento TEXT NOT NULL,
  sdi_id TEXT,
  tipo_notifica TEXT,
  messaggio TEXT,
  errori JSONB DEFAULT '[]',
  xml_content TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
