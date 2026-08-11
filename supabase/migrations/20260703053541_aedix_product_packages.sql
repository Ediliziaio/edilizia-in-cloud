-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.aedix_product_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id uuid NOT NULL REFERENCES public.aedix_product_lines(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descrizione text,
  prezzo numeric NOT NULL DEFAULT 0,
  ricorrenza text NOT NULL DEFAULT 'mensile',
  ltv_target numeric NOT NULL DEFAULT 0,
  attivo boolean NOT NULL DEFAULT true,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aedix_product_packages_line ON public.aedix_product_packages(product_line_id);

ALTER TABLE public.aedix_product_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aedix_product_packages super admin all" ON public.aedix_product_packages;
CREATE POLICY "aedix_product_packages super admin all" ON public.aedix_product_packages
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
