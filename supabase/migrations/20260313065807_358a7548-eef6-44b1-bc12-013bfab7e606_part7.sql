CREATE POLICY "fo_upd" ON public.fattura_ordine FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id());
