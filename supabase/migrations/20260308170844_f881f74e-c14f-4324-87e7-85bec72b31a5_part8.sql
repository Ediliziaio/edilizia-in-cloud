CREATE POLICY "Company users can view their sms_logs"
  ON public.sms_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );
