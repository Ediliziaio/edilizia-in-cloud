-- AI Credits: SuperAdmin full, company read own
DROP POLICY IF EXISTS "sa_credits_all" ON public.ai_credits;
CREATE POLICY "sa_credits_all" ON public.ai_credits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
