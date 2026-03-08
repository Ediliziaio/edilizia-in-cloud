
-- Add DND columns for SMS and Call to marketing_contacts
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS optout_sms boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS optout_call boolean DEFAULT false;

-- Add booking_slug to marketing_calendars for public booking links
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS booking_slug text UNIQUE;

-- Create index for fast slug lookup
CREATE INDEX IF NOT EXISTS idx_marketing_calendars_booking_slug ON public.marketing_calendars(booking_slug) WHERE booking_slug IS NOT NULL;

-- RLS: Allow public read on marketing_calendars by slug (for booking page)
CREATE POLICY "Public can read calendars by slug"
  ON public.marketing_calendars
  FOR SELECT
  TO anon
  USING (booking_slug IS NOT NULL AND is_active = true);

-- RLS: Allow public read on marketing_calendar_availability for booking
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

-- RLS: Allow anon to read appointments for slot exclusion (only date/time, no details)
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

-- RLS: Allow anon to insert appointments (for public booking)
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
