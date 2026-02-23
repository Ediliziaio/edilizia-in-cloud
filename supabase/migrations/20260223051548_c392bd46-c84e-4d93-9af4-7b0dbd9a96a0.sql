
-- Add address and geolocation columns to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_province text,
  ADD COLUMN IF NOT EXISTS address_country text DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS address_notes text,
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS place_id text;
