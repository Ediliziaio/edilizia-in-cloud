-- No client-side write; only edge functions via service role
DROP POLICY IF EXISTS "No direct client write to audit log" ON public.integration_audit_log;
CREATE POLICY "No direct client write to audit log"
  ON public.integration_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);
