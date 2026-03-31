-- Migration: lifecycle_events_log
-- Tracks which lifecycle events have been sent to which companies,
-- preventing duplicate sends.

CREATE TABLE IF NOT EXISTS public.lifecycle_events_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event         text NOT NULL,           -- 'first_week', 'first_month', 'renewal_upcoming', 'high_usage', 'inactive_7d', etc.
  sent_at       timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb
);

-- Performance indexes (dedup is handled at application level via sentSet checks)
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_lookup
  ON public.lifecycle_events_log(company_id, event, sent_at DESC);

-- For lookups by company
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_company
  ON public.lifecycle_events_log(company_id, sent_at DESC);

-- RLS
ALTER TABLE public.lifecycle_events_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read lifecycle events" ON public.lifecycle_events_log;
CREATE POLICY "Super admins read lifecycle events"
  ON public.lifecycle_events_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Service role manage lifecycle events" ON public.lifecycle_events_log;
CREATE POLICY "Service role manage lifecycle events"
  ON public.lifecycle_events_log FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
