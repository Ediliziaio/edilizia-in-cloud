DROP POLICY IF EXISTS "kb_categories_company" ON public.ai_kb_categories;
CREATE POLICY "kb_categories_company" ON public.ai_kb_categories FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
