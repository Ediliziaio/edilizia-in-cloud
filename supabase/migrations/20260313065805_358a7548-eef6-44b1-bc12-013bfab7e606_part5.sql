CREATE POLICY "fo_sel" ON public.fattura_ordine FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
