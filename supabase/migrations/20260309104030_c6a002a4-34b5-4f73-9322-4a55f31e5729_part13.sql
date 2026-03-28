CREATE POLICY "qpm_ins" ON public.quote_pdf_materials FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
