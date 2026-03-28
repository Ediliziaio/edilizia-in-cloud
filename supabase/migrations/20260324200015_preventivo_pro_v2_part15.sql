-- ━━━ BLOCCO D: GRIGLIA PREZZI ━━━
-- Usata SOLO per prodotti con modalita_prezzo = 'griglia'
-- Ogni riga è una cella della matrice dimensioni → prezzo
CREATE TABLE IF NOT EXISTS public.listino_griglia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prodotto_id UUID NOT NULL REFERENCES public.article_templates(id) ON DELETE CASCADE,
  -- Dimensioni in mm (interi per evitare problemi float nei confronti)
  valore_x INTEGER NOT NULL,  -- es: larghezza 1000 = 1000mm
  valore_y INTEGER NOT NULL,  -- es: altezza 1200 = 1200mm
  prezzo_vendita  NUMERIC(12,4) NOT NULL,
  prezzo_acquisto NUMERIC(12,4) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (prodotto_id, valore_x, valore_y)
);
