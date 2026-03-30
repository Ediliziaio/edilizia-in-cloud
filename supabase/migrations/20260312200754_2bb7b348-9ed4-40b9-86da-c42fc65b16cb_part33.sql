DROP POLICY IF EXISTS "hr_giornate_self_read" ON public.hr_giornate;
CREATE POLICY "hr_giornate_self_read" ON public.hr_giornate FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));
