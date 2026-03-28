CREATE POLICY "Authenticated users can read own company email credits log"
  ON public.email_credits_log FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
