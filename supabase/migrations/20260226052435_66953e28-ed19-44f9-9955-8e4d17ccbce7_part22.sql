DROP POLICY IF EXISTS "Company members read busy slots" ON public.google_calendar_busy_slots;
CREATE POLICY "Company members read busy slots"
  ON public.google_calendar_busy_slots FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
