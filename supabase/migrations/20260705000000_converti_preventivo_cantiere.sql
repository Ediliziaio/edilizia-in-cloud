-- IMP05: Conversione Preventivo → Cantiere
-- Aggiunge quote_id e quote_number alla tabella orders
-- e rende customer_id nullable per supportare ordini senza profilo cliente

-- 1. Rendi customer_id nullable (necessario per ordini da preventivo senza profilo)
ALTER TABLE public.orders
  ALTER COLUMN customer_id DROP NOT NULL;

-- 2. Aggiunge colonna quote_id
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL;

-- 3. Aggiunge colonna quote_number (riferimento leggibile)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quote_number TEXT;

-- 4. Aggiunge colonne dati cliente (se non presenti)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_name    TEXT,
  ADD COLUMN IF NOT EXISTS client_email   TEXT,
  ADD COLUMN IF NOT EXISTS client_phone   TEXT,
  ADD COLUMN IF NOT EXISTS client_company TEXT,
  ADD COLUMN IF NOT EXISTS client_address TEXT;

-- 5. Aggiunge campi lavori dal preventivo (se non presenti)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS indirizzo_lavori TEXT,
  ADD COLUMN IF NOT EXISTS tipo_lavoro      TEXT;

-- 6. Aggiunge created_by (se non presente)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 7. Aggiunge status testuale (se non presente) per "confermato" ecc.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confermato';

-- 8. Indice su quote_id per lookup rapidi
CREATE INDEX IF NOT EXISTS idx_orders_quote_id ON public.orders(quote_id);
