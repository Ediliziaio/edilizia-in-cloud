CREATE POLICY "Users can manage own company cost categories"
ON public.cost_categories FOR ALL TO authenticated
USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
