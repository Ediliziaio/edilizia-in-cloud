DROP POLICY IF EXISTS "fo_del" ON public.fattura_ordine;
CREATE POLICY "fo_del" ON public.fattura_ordine FOR DELETE TO authenticated USING (company_id = public.get_my_company_id());
