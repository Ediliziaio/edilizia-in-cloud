DROP POLICY IF EXISTS "hr_richieste_self" ON public.hr_richieste;
CREATE POLICY "hr_richieste_self" ON public.hr_richieste FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));
