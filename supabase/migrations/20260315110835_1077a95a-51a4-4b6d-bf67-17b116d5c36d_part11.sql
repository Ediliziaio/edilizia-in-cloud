DROP POLICY IF EXISTS "credit_transactions_company" ON public.ai_credit_transactions;
CREATE POLICY "credit_transactions_company" ON public.ai_credit_transactions
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
