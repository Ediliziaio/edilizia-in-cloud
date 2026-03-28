-- Create index for fast slug lookup
CREATE INDEX IF NOT EXISTS idx_marketing_calendars_booking_slug ON public.marketing_calendars(booking_slug) WHERE booking_slug IS NOT NULL;
