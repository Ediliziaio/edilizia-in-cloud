-- Audit log: read-only for company admins and super admins
DROP POLICY IF EXISTS "Admins read gdpr audit log" ON public.gdpr_audit_log;
CREATE POLICY "Admins read gdpr audit log"
ON public.gdpr_audit_log FOR SELECT TO authenticated
USING (
  company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
