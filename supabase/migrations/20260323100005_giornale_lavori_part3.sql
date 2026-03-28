CREATE TABLE public.giornale_foto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giornale_id UUID NOT NULL REFERENCES public.giornale_lavori(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
