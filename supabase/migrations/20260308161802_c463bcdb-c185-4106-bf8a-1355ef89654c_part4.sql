-- RLS: Allow public read on marketing_calendar_availability for booking
DROP POLICY IF EXISTS "Public can read availability for active calendars" ON public.marketing_calendar_availability;
CREATE POLICY "Public can read availability for active calendars"
  ON public.marketing_calendar_availability
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.marketing_calendars mc
      WHERE mc.id = calendar_id
        AND mc.booking_slug IS NOT NULL
        AND mc.is_active = true
    )
  );
