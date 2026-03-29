-- ============================================================
-- ARTICOLI / LISTINO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.articoli_native (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  codice TEXT,
  descrizione TEXT NOT NULL,
  descrizione_estesa TEXT,
  unita_misura TEXT DEFAULT 'pz',

  prezzo_vendita DECIMAL(15,4) NOT NULL DEFAULT 0,
  prezzo_acquisto DECIMAL(15,4),

  aliquota_iva TEXT NOT NULL DEFAULT '22',
  natura_iva TEXT,

  categoria TEXT,
  attivo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
