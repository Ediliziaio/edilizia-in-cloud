DROP POLICY IF EXISTS "qpm_sel" ON public.quote_pdf_materials;
CREATE POLICY "qpm_sel" ON public.quote_pdf_materials FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
