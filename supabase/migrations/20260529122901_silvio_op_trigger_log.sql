-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.silvio_trigger_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo          text NOT NULL,
  chiave_evento text NOT NULL,
  esecuzione_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tipo, chiave_evento)
);
CREATE INDEX IF NOT EXISTS idx_silvio_trigger_log ON public.silvio_trigger_log (company_id, tipo, created_at DESC);

ALTER TABLE public.silvio_trigger_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_trigger_read ON public.silvio_trigger_log;
CREATE POLICY silvio_trigger_read ON public.silvio_trigger_log FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_trigger_service ON public.silvio_trigger_log;
CREATE POLICY silvio_trigger_service ON public.silvio_trigger_log FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_trigger_super ON public.silvio_trigger_log;
CREATE POLICY silvio_trigger_super ON public.silvio_trigger_log FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.silvio_trigger_log IS 'MP-SILVIO-03: idempotenza dei trigger proattivi (un evento → una sola proposta).';
