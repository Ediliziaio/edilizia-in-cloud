-- Bug #5: Add super_admin bypass to fattura_ordine RLS policies
DROP POLICY IF EXISTS "fattura_ordine_select" ON public.fattura_ordine;
