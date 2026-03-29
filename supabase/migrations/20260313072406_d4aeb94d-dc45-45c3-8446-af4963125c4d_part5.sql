CREATE POLICY "fattura_ordine_delete" ON public.fattura_ordine
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );
