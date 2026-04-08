-- Crea tabella foto_cantiere con geolocalizzazione e storage bucket

CREATE TABLE IF NOT EXISTS public.foto_cantiere (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  latitudine DECIMAL(10,7),
  longitudine DECIMAL(10,7),
  accuracy_meters DECIMAL(6,1),
  taken_at TIMESTAMPTZ NOT NULL,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  descrizione TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.foto_cantiere ENABLE ROW LEVEL SECURITY;

CREATE POLICY foto_cantiere_company ON public.foto_cantiere
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_foto_cantiere_order ON public.foto_cantiere(order_id);
CREATE INDEX IF NOT EXISTS idx_foto_cantiere_company ON public.foto_cantiere(company_id);
CREATE INDEX IF NOT EXISTS idx_foto_cantiere_taken ON public.foto_cantiere(company_id, taken_at DESC);

-- Storage bucket privato per le foto
INSERT INTO storage.buckets (id, name, public)
VALUES ('foto-cantiere', 'foto-cantiere', false) ON CONFLICT DO NOTHING;
