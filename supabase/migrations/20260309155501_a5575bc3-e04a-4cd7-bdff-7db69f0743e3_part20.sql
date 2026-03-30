DROP POLICY IF EXISTS "company_billing_integrations" ON public.billing_integrations;
CREATE POLICY "company_billing_integrations" ON billing_integrations
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));
