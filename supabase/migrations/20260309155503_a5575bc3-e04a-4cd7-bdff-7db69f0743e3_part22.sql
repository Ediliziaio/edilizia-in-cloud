DROP POLICY IF EXISTS "company_invoice_lines" ON public.invoice_lines;
CREATE POLICY "company_invoice_lines" ON invoice_lines
  FOR ALL USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE company_id = get_user_company_id(auth.uid())
    )
  );
