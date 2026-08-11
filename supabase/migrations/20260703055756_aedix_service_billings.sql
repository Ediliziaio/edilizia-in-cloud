-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.aedix_service_billings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_client_id uuid NOT NULL REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  periodo date NOT NULL,
  importo_dovuto numeric NOT NULL DEFAULT 0,
  importo_incassato numeric NOT NULL DEFAULT 0,
  data_incasso date,
  societa text,
  stato text NOT NULL DEFAULT 'dovuto',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aedix_service_billings_client ON public.aedix_service_billings(service_client_id);
CREATE INDEX IF NOT EXISTS idx_aedix_service_billings_periodo ON public.aedix_service_billings(periodo);
CREATE INDEX IF NOT EXISTS idx_aedix_service_billings_societa ON public.aedix_service_billings(societa);
ALTER TABLE public.aedix_service_billings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aedix_service_billings super admin all" ON public.aedix_service_billings;
CREATE POLICY "aedix_service_billings super admin all" ON public.aedix_service_billings
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
