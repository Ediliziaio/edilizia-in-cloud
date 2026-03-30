DROP POLICY IF EXISTS "qpm_del" ON public.quote_pdf_materials;
CREATE POLICY "qpm_del" ON public.quote_pdf_materials FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());
