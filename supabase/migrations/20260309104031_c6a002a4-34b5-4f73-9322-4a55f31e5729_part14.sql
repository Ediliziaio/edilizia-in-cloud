DROP POLICY IF EXISTS "qpm_upd" ON public.quote_pdf_materials;
CREATE POLICY "qpm_upd" ON public.quote_pdf_materials FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());
