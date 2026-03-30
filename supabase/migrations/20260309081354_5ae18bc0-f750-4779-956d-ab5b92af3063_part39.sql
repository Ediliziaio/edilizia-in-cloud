DROP POLICY IF EXISTS "Company users manage own rules" ON public.bank_categorization_rules;
CREATE POLICY "Company users manage own rules" ON public.bank_categorization_rules FOR ALL TO authenticated USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())) WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
