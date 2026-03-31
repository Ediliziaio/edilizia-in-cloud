-- Migration: integration_health_log
-- Centralised table for external integration health status checks.

CREATE TABLE IF NOT EXISTS public.integration_health_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text NOT NULL,           -- e.g. 'stripe', 'meta', 'sendgrid'
  company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'unconfigured', 'security_error')),
  response_ms     integer,
  error_message   text,
  checked_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for latest-per-integration lookups
CREATE INDEX IF NOT EXISTS idx_integration_health_name_at
  ON public.integration_health_log(integration_name, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_health_company
  ON public.integration_health_log(company_id, checked_at DESC)
  WHERE company_id IS NOT NULL;

-- Index for recent data access patterns
CREATE INDEX IF NOT EXISTS idx_integration_health_recent
  ON public.integration_health_log(checked_at DESC);

-- RLS: only super_admins can read global rows; company admins can read their own
ALTER TABLE public.integration_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read integration health" ON public.integration_health_log;
CREATE POLICY "Super admins read integration health"
  ON public.integration_health_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Company admins read own integration health" ON public.integration_health_log;
CREATE POLICY "Company admins read own integration health"
  ON public.integration_health_log FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = integration_health_log.company_id
    )
  );

-- Service role can insert (used by edge function)
DROP POLICY IF EXISTS "Service role insert integration health" ON public.integration_health_log;
CREATE POLICY "Service role insert integration health"
  ON public.integration_health_log FOR INSERT TO service_role
  WITH CHECK (true);
