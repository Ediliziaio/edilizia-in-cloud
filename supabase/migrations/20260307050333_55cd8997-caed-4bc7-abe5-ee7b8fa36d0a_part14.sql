-- AI Credit Topups: SuperAdmin full, company read own
DROP POLICY IF EXISTS "sa_topups_all" ON public.ai_credit_topups;
CREATE POLICY "sa_topups_all" ON public.ai_credit_topups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
