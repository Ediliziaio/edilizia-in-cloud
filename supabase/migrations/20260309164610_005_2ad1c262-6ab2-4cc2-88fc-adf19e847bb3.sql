CREATE POLICY "Tenant isolation for bank_reconciliations"
  ON public.bank_reconciliations
  FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
