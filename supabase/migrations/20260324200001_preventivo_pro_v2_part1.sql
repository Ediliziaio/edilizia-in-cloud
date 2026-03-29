-- ━━━ BLOCCO B: CATEGORIE LISTINO ━━━
-- Creata prima di tariffe_aziendali (nessuna FK verso nuove tabelle)
CREATE TABLE IF NOT EXISTS public.listino_categorie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  colore TEXT DEFAULT '#6b7280',
  icona TEXT DEFAULT 'Package',
  margine_target_percentuale NUMERIC(5,2) DEFAULT 25,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, nome)
);
