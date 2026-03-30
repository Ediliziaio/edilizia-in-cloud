DROP POLICY IF EXISTS "company_invoice_payments" ON public.invoice_payments;
CREATE POLICY "company_invoice_payments" ON invoice_payments
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));
