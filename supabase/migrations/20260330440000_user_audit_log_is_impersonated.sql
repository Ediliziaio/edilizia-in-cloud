-- Item 12: Add is_impersonated flag to user_audit_log
-- Allows the UI to show a badge on audit log entries performed by a super_admin
-- acting as (impersonating) a company.
ALTER TABLE public.user_audit_log
  ADD COLUMN IF NOT EXISTS is_impersonated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_audit_log_is_impersonated
  ON public.user_audit_log (is_impersonated)
  WHERE is_impersonated = true;
