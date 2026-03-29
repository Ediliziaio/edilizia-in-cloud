CREATE POLICY "company_see_own_invoices"
  ON public.subscription_invoices
  FOR SELECT
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid()
    )
  );
