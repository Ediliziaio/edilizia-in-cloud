-- RLS: Allow anon to read appointments for slot exclusion (only date/time, no details)
DROP POLICY IF EXISTS "Public can check appointment slots" ON public.appointments;
CREATE POLICY "Public can check appointment slots"
  ON public.appointments
  FOR SELECT
  TO anon
  USING (
    calendar_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.marketing_calendars mc
      WHERE mc.id = calendar_id
        AND mc.booking_slug IS NOT NULL
        AND mc.is_active = true
    )
  );
