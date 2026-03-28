-- No client-side write; only edge functions via service role
CREATE POLICY "No direct client write to audit log"
  ON public.integration_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);
