-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.aedix_service_commission_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  etichetta text,
  base text NOT NULL DEFAULT 'fatturato',
  percentuale numeric NOT NULL DEFAULT 0,
  attivo boolean NOT NULL DEFAULT true,
  ordine integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aedix_service_commission_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aedix_service_commission_lines super admin all" ON public.aedix_service_commission_lines;
CREATE POLICY "aedix_service_commission_lines super admin all" ON public.aedix_service_commission_lines
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE INDEX IF NOT EXISTS idx_ascl_client ON public.aedix_service_commission_lines(service_client_id);

ALTER TABLE public.aedix_service_billings
  ADD COLUMN IF NOT EXISTS righe_provvigione jsonb NOT NULL DEFAULT '[]'::jsonb;
