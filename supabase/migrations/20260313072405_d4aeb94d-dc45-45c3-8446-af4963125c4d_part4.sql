CREATE POLICY "fattura_ordine_insert" ON public.fattura_ordine
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );
