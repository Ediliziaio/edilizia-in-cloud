-- Insert policy for audit log (system can insert for any authenticated user)
CREATE POLICY "System inserts gdpr audit log"
ON public.gdpr_audit_log FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
