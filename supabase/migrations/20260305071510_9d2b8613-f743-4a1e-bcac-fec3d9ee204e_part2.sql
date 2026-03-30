DROP POLICY IF EXISTS "Users can manage own company sections" ON public.warehouse_sections;
CREATE POLICY "Users can manage own company sections"
  ON public.warehouse_sections FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
