-- Giornale dei Lavori
CREATE TABLE public.giornale_lavori (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  data_lavori DATE NOT NULL DEFAULT CURRENT_DATE,
  temperatura TEXT,
  condizioni_meteo TEXT DEFAULT 'soleggiato' CHECK (condizioni_meteo IN ('soleggiato','nuvoloso','pioggia','neve','vento forte')),
  lavorazioni_eseguite TEXT NOT NULL,
  materiali_utilizzati TEXT,
  personale_presente INTEGER DEFAULT 1,
  note TEXT,
  avanzamento_percentuale INTEGER CHECK (avanzamento_percentuale BETWEEN 0 AND 100),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  firma_capocantiere TEXT,
  firmato_da TEXT,
  firmato_il TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, data_lavori)
);

ALTER TABLE public.giornale_lavori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_giornale" ON public.giornale_lavori FOR ALL
  USING (company_id = public.get_my_company_id());

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

ALTER TABLE public.giornale_foto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_access_giornale_foto" ON public.giornale_foto FOR ALL
  USING (company_id = public.get_my_company_id());
