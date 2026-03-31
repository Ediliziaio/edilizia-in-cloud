-- Migration: dunning_attempts table
-- Tracks every dunning email attempt with status, enabling retry on failure
-- and preventing duplicate sends.

CREATE TABLE IF NOT EXISTS public.dunning_attempts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dunning_day   text NOT NULL,           -- 'dunning_day0', 'dunning_day3', 'dunning_day7', 'trial_expiring_3d', 'trial_expired_email'
  sent_at       timestamptz,
  status        text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  retry_count   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for the main deduplication query
CREATE INDEX IF NOT EXISTS idx_dunning_attempts_company_day
  ON public.dunning_attempts (company_id, dunning_day, status);

-- RLS: only service role can access
ALTER TABLE public.dunning_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON public.dunning_attempts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );
