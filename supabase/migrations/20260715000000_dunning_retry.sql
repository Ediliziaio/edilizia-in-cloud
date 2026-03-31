-- Migration: Add retry fields to dunning_attempts and create dunning_log view
-- Enables retry logic for failed dunning emails

ALTER TABLE public.dunning_attempts
  ADD COLUMN IF NOT EXISTS next_retry_at  timestamptz,
  ADD COLUMN IF NOT EXISTS permanently_failed boolean NOT NULL DEFAULT false;

-- Index for pending retries query
CREATE INDEX IF NOT EXISTS idx_dunning_attempts_retry
  ON public.dunning_attempts (next_retry_at)
  WHERE status = 'failed' AND permanently_failed = false;

-- Grant super_admin INSERT/UPDATE as well (existing policy only covers SELECT via service_role)
DROP POLICY IF EXISTS "super_admin_insert_dunning" ON public.dunning_attempts;
CREATE POLICY "super_admin_insert_dunning" ON public.dunning_attempts
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "super_admin_update_dunning" ON public.dunning_attempts;
CREATE POLICY "super_admin_update_dunning" ON public.dunning_attempts
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);
