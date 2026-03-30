DROP POLICY IF EXISTS "hr_timbrature_self_read" ON public.hr_timbrature;
CREATE POLICY "hr_timbrature_self_read" ON public.hr_timbrature FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));
