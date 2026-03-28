CREATE POLICY "fattura_ordine_select" ON public.fattura_ordine
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );
