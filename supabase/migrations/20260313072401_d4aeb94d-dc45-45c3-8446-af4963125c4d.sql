
-- Bug #5: Add super_admin bypass to fattura_ordine RLS policies
DROP POLICY IF EXISTS "fattura_ordine_select" ON public.fattura_ordine;
DROP POLICY IF EXISTS "fattura_ordine_insert" ON public.fattura_ordine;
DROP POLICY IF EXISTS "fattura_ordine_delete" ON public.fattura_ordine;

CREATE POLICY "fattura_ordine_select" ON public.fattura_ordine
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "fattura_ordine_insert" ON public.fattura_ordine
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "fattura_ordine_delete" ON public.fattura_ordine
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin')
  );
