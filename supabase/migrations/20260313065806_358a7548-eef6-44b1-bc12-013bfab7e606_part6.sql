DROP POLICY IF EXISTS "fo_ins" ON public.fattura_ordine;
CREATE POLICY "fo_ins" ON public.fattura_ordine FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id());
