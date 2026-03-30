DROP POLICY IF EXISTS "hr_profili_self_read" ON public.hr_profili;
CREATE POLICY "hr_profili_self_read" ON public.hr_profili FOR SELECT TO authenticated
  USING (user_id = auth.uid());
