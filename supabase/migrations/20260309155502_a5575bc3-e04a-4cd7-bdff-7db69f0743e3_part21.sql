CREATE POLICY "company_invoices" ON invoices
  FOR ALL USING (company_id = get_user_company_id(auth.uid()));
