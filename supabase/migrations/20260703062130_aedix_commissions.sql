-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.aedix_service_clients
  ADD COLUMN IF NOT EXISTS commerciale text,
  ADD COLUMN IF NOT EXISTS commerciale_id uuid;

ALTER TABLE public.aedix_service_billings
  ADD COLUMN IF NOT EXISTS provvigione_commerciale text,
  ADD COLUMN IF NOT EXISTS provvigione_pct numeric,
  ADD COLUMN IF NOT EXISTS provvigione_importo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provvigione_stato text NOT NULL DEFAULT 'da_pagare',
  ADD COLUMN IF NOT EXISTS provvigione_pagata_at date;

CREATE TABLE IF NOT EXISTS public.aedix_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commerciale text,
  product_line_id uuid REFERENCES public.aedix_product_lines(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.aedix_product_packages(id) ON DELETE CASCADE,
  applies_to text NOT NULL DEFAULT 'tutto',
  tipo text NOT NULL DEFAULT 'percentuale',
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
