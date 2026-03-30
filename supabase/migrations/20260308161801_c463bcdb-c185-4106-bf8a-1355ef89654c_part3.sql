-- RLS: Allow public read on marketing_calendars by slug (for booking page)
DROP POLICY IF EXISTS "Public can read calendars by slug" ON public.marketing_calendars;
CREATE POLICY "Public can read calendars by slug"
  ON public.marketing_calendars
  FOR SELECT
  TO anon
  USING (booking_slug IS NOT NULL AND is_active = true);
