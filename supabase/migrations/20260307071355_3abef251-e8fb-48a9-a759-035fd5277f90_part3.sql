DROP POLICY IF EXISTS "Company members can view own email_credits" ON public.email_credits;
CREATE POLICY "Company members can view own email_credits"
  ON public.email_credits FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
