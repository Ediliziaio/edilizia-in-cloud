-- AI Credit Usage: SuperAdmin full, company read own
DROP POLICY IF EXISTS "sa_usage_all" ON public.ai_credit_usage;
CREATE POLICY "sa_usage_all" ON public.ai_credit_usage
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
