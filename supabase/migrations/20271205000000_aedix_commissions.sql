-- Provvigioni commerciali sui servizi (Fase 4).
--
-- Modello confermato: si paga sull'INCASSATO; cosa remunerare è flessibile
-- ("di volta in volta") → la provvigione si registra sul singolo incasso, con
-- il commerciale e %/importo, e uno stato da_pagare→pagata. Le regole default
-- (aedix_commission_rules) servono solo a pre-compilare (per pacchetto, con
-- applies_to una_tantum/ricorrente/tutto), non a ingabbiare.

-- 1) Chi guadagna: commerciale sul cliente-servizio (default per gli incassi).
ALTER TABLE public.aedix_service_clients
  ADD COLUMN IF NOT EXISTS commerciale text,
  ADD COLUMN IF NOT EXISTS commerciale_id uuid;

-- 2) Provvigione registrata sul singolo incasso.
ALTER TABLE public.aedix_service_billings
  ADD COLUMN IF NOT EXISTS provvigione_commerciale text,
  ADD COLUMN IF NOT EXISTS provvigione_pct numeric,
  ADD COLUMN IF NOT EXISTS provvigione_importo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provvigione_stato text NOT NULL DEFAULT 'da_pagare', -- da_pagare | pagata
  ADD COLUMN IF NOT EXISTS provvigione_pagata_at date;

-- 3) Regole provvigione default (pre-compilazione).
CREATE TABLE IF NOT EXISTS public.aedix_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commerciale text,                             -- nome commerciale (null = vale per tutti)
  product_line_id uuid REFERENCES public.aedix_product_lines(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.aedix_product_packages(id) ON DELETE CASCADE,
  applies_to text NOT NULL DEFAULT 'tutto',     -- una_tantum | ricorrente | tutto
  tipo text NOT NULL DEFAULT 'percentuale',     -- percentuale | fisso
  valore numeric NOT NULL DEFAULT 0,
  priorita integer NOT NULL DEFAULT 0,
  attivo boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aedix_commission_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aedix_commission_rules super admin all" ON public.aedix_commission_rules;
CREATE POLICY "aedix_commission_rules super admin all" ON public.aedix_commission_rules
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
