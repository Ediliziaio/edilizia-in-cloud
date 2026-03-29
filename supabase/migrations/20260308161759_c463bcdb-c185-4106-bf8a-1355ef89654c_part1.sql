-- Add booking_slug to marketing_calendars for public booking links
ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS booking_slug text UNIQUE;
