-- RLS: Allow anon to insert appointments (for public booking)
DROP POLICY IF EXISTS "Public can create bookings" ON public.appointments;
CREATE POLICY "Public can create bookings"
  ON public.appointments
  FOR INSERT
  TO anon
  WITH CHECK (
    calendar_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.marketing_calendars mc
      WHERE mc.id = calendar_id
        AND mc.booking_slug IS NOT NULL
        AND mc.is_active = true
    )
  );
